#!/usr/bin/env bash
# Prints token usage per PR x stage x role (model), as input for docs/retro.md. Read-only.
# Source: Claude Code session logs on this machine (not available in CI). Reads every checkout
# folder of this repo under ~/.claude/projects (main working dir and ../outpost-* worktrees).
# PR link: row gitBranch = PR head branch (연결=브랜치); otherwise (main/HEAD) by time inside the
# PR's open period (연결=시간); several PRs open at once -> one `동시 진행(...)` bucket, counted once. Stage link: row timestamp inside the `stage:*`
# intervals from pr-stages.jq. Subagent rows take agentType from agent-*.meta.json; the rest
# is `main session`. Counts only; no cost conversion. Logs are never copied or printed.
# Review by Codex web and neon is not in these logs.
# Usage: scripts/pr-tokens.sh [pr-number...]   (default: the last 20 merged PRs)
set -euo pipefail

cd "$(dirname "$0")"
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
root="${CLAUDE_PROJECTS_DIR:-$HOME/.claude/projects}"

if [ $# -eq 0 ]; then
  set -- $(gh pr list --state merged --limit 20 --json number -q '.[].number' | sort -n)
fi

slim='[ .[] | select(.type == "assistant" and .message.id != null and .message.usage != null)
  | {branch: .gitBranch, ts: .timestamp, id: .message.id, model: .message.model, role: $role, u: .message.usage} ]'

rows=$(mktemp)
trap 'rm -f "$rows"' EXIT
for dir in "$root"/-Users-*-money-working* "$root"/-Users-*-money-outpost-*; do
  [ -d "$dir" ] || continue
  for f in "$dir"/*.jsonl "$dir"/*/subagents/agent-*.jsonl; do
    [ -f "$f" ] || continue
    role="main session"
    meta="${f%.jsonl}.meta.json"
    if [ -f "$meta" ]; then role=$(jq -r '.agentType // "subagent"' "$meta"); fi
    jq -c -s --arg role "$role" "$slim" "$f"
  done
done | jq -s -c 'add // []' >"$rows"

prs='[]'
for n in "$@"; do
  one=$(jq -n \
    --argjson pr "$(gh api "repos/$repo/pulls/$n")" \
    --argjson timeline "$(gh api --paginate --slurp "repos/$repo/issues/$n/timeline" | jq 'add // []')" \
    '{pr: $pr, timeline: $timeline}' | jq -c -f pr-stages.jq)
  meta=$(gh api "repos/$repo/pulls/$n" -q '{branch: .head.ref, opened: (.created_at | fromdateiso8601), closed: ((.merged_at // .closed_at) | if . then fromdateiso8601 else null end)}')
  prs=$(jq -c --argjson one "$one" --argjson m "$meta" '. + [{number: $one.number, title: $one.title, intervals: $one.intervals} + $m]' <<<"$prs")
done

printf '| PR | 연결 | 단계 | 역할 (모델) | 입력 | 출력 | 캐시 읽기 | 캐시 쓰기 |\n'
printf '|---|---|---|---|---|---|---|---|\n'
jq -n -c --slurpfile rows "$rows" --argjson prs "$prs" --argjson now "$(date +%s)" '{rows: $rows[0], prs: $prs, now: $now}' |
  jq -r -f pr-tokens.jq |
  jq -r '.[] | "| \(.pr) | \(.link) | \(.stage) | \(.role) | \(.input) | \(.output) | \(.cache_read) | \(.cache_write) |"'
