#!/usr/bin/env bash
# Prints review and CI numbers per PR, as input for docs/retro.md. Read-only.
# Counts: open→merge minutes, Codex reviews and inline findings, neon reviews (and skipped),
# user comments, approvals, failed workflow runs on the PR branch.
# Before #4 every post went out as the user account, so user and neon columns mix there.
# A second table splits each PR by `stage:*` label: minutes and commits per stage, and human
# wait (plan: last plan commit/review → stage change; approve: last Codex review or commit →
# final user Approve). PRs without stage labels show dashes.
# Usage: scripts/pr-stats.sh [pr-number...]   (default: the last 20 merged PRs)
set -euo pipefail

cd "$(dirname "$0")"
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

if [ $# -eq 0 ]; then
  set -- $(gh pr list --state merged --limit 20 --json number -q '.[].number' | sort -n)
fi

printf '| PR | 열림→머지(분) | Codex 리뷰·지적 | neon 리뷰(skipped) | 사용자 코멘트 | Approve | CI 실패 |\n'
printf '|---|---|---|---|---|---|---|\n'
for n in "$@"; do
  pr=$(gh api "repos/$repo/pulls/$n")
  branch=$(jq -r .head.ref <<<"$pr")
  jq -n \
    --argjson pr "$pr" \
    --argjson comments "$(gh api --paginate --slurp "repos/$repo/issues/$n/comments" | jq 'add // []')" \
    --argjson reviews "$(gh api --paginate --slurp "repos/$repo/pulls/$n/reviews" | jq 'add // []')" \
    --argjson inline "$(gh api --paginate --slurp "repos/$repo/pulls/$n/comments" | jq 'add // []')" \
    --argjson runs "$(gh run list --branch "$branch" --event pull_request --limit 200 --json conclusion)" \
    '{pr: $pr, comments: $comments, reviews: $reviews, inline: $inline, runs: $runs}' |
    jq -r -f pr-stats.jq |
    jq -r '"| #\(.number) \(.title) | \(.open_to_merge_min // "—") | \(.codex_reviews)·\(.codex_findings) | \(.neon_reviews)(\(.neon_skipped)) | \(.user_comments) | \(.approvals) | \(.ci_failures) |"'
done

stage_cell() { # stage_cell <json> <stage>
  jq -r --arg s "$2" '.stages[$s] | if . == null then "—" else "\(.min)분 (커밋 \(.commits))" end' <<<"$1"
}
printf '\n| PR | plan-review | dev | qa | playtest | code-review | 플랜 승인 대기(분) | Approve 대기(분) |\n'
printf '|---|---|---|---|---|---|---|---|\n'
for n in "$@"; do
  row=$(jq -n \
    --argjson pr "$(gh api "repos/$repo/pulls/$n")" \
    --argjson timeline "$(gh api --paginate --slurp "repos/$repo/issues/$n/timeline" | jq 'add // []')" \
    '{pr: $pr, timeline: $timeline}' | jq -c -f pr-stages.jq)
  printf '| #%s | %s | %s | %s | %s | %s | %s | %s |\n' "$n" \
    "$(stage_cell "$row" plan-review)" "$(stage_cell "$row" dev)" "$(stage_cell "$row" qa)" "$(stage_cell "$row" playtest)" "$(stage_cell "$row" code-review)" \
    "$(jq -r '.wait_plan_min // "—"' <<<"$row")" "$(jq -r '.wait_approve_min // "—"' <<<"$row")"
done
