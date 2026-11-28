#!/usr/bin/env bash
# Runs the neon (Antigravity CLI) plan review and posts it to the PR as the agent account.
# Usage: scripts/neon-review.sh <pr-number> <plan-file>
# Posts with the current gh account, which must be the agent account (Claude Code agent
# sessions set GH_CONFIG_DIR; from your own terminal, set it explicitly).
set -euo pipefail

pr=${1:?usage: scripts/neon-review.sh <pr-number> <plan-file>}
plan=${2:?usage: scripts/neon-review.sh <pr-number> <plan-file>}
agent=chillingdaisy-worker1
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
cd "$(git rev-parse --show-toplevel)"
# shellcheck source=scripts/neon-lib.sh
. "$(dirname "$0")/neon-lib.sh"
# Review the PR head's plan, not whatever the current checkout holds.
head=$(gh pr view "$pr" --repo "$repo" --json headRefOid -q .headRefOid)
git cat-file -e "$head^{commit}" 2>/dev/null || git fetch -q origin "pull/$pr/head"
sha=${head:0:7}
plan_text=$(git show "$head:$plan") || { echo "neon-review: PR #$pr head $sha에 '$plan'이 없다" >&2; exit 1; }

who=$(gh api user -q .login 2>/dev/null || echo "?")
if [ "$who" != "$agent" ]; then
  echo "neon-review: 현재 gh 계정이 '$who'다. '$agent'로 실행한다(GH_CONFIG_DIR=<에이전트 gh 폴더>)" >&2
  exit 1
fi

out=$(mktemp)
trap 'rm -f "$out"' EXIT
prompt=$(
  echo '도구(파일 읽기·명령 실행)를 쓰지 말고, 아래에 붙인 내용만으로 답한다.'
  echo
  cat .claude/prompts/neon-plan-review.md
  echo
  echo "--- 리뷰 대상 플랜 (커밋 $sha) ---"
  printf '%s\n' "$plan_text"
)

if agy -p "$prompt" --mode plan --print-timeout 300s >"$out" 2>&1 && [ -s "$out" ] && ! grep -q '^jetski: no output produced' "$out"; then
  text=$(cat "$out")
  verdict=done
else
  text="사유: $(head -c 300 "$out" | tr '\n' ' ')"
  verdict=skipped
fi

# Mentions in the model's text must not ping anyone: `@codex review` in a review once
# triggered Codex for real. A zero-width joiner after `@` keeps the text readable.
text=$(neon_neutralize_mentions <<<"$text")

if [ "$verdict" = done ]; then
  body=$(printf '## neon review · `%s`\n\n%s' "$sha" "$text")
else
  body=$(printf '## neon review · `%s` · skipped\n\n%s' "$sha" "$text")
fi

gh pr comment "$pr" --repo "$repo" --body "$body" >/dev/null
echo "neon review $verdict for $sha (PR #$pr, posted as $agent)"
