#!/usr/bin/env bash
# Prints review and CI numbers per PR, as input for docs/retro.md. Read-only.
# Counts: open→merge minutes, Codex reviews and inline findings, neon reviews (and skipped),
# user comments, approvals, failed workflow runs on the PR branch.
# Before #4 every post went out as the user account, so user and neon columns mix there.
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
