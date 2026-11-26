#!/usr/bin/env bash
# Runs the neon (Antigravity CLI) plan review and posts it to the PR as the reviewer account.
# Usage: scripts/neon-review.sh <pr-number> <plan-file>
set -euo pipefail

pr=${1:?usage: scripts/neon-review.sh <pr-number> <plan-file>}
plan=${2:?usage: scripts/neon-review.sh <pr-number> <plan-file>}
reviewer=chillingdaisy-worker1
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
cd "$(git rev-parse --show-toplevel)"
sha=$(git rev-parse --short HEAD)

# Token only for this process; never printed.
if ! token=$(gh auth token --user "$reviewer" 2>/dev/null); then
  echo "neon-review: '$reviewer' 계정으로 gh 로그인이 필요하다" >&2
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
  cat "$plan"
)

if agy -p "$prompt" --mode plan --print-timeout 300s >"$out" 2>&1 && [ -s "$out" ] && ! grep -q '^jetski: no output produced' "$out"; then
  body=$(printf '## neon review · `%s`\n\n%s' "$sha" "$(cat "$out")")
  verdict=done
else
  reason=$(head -c 300 "$out" | tr '\n' ' ')
  body=$(printf '## neon review · `%s` · skipped\n\n사유: %s' "$sha" "${reason:-출력 없음}")
  verdict=skipped
fi

GH_TOKEN="$token" gh pr comment "$pr" --repo "$repo" --body "$body" >/dev/null
echo "neon review $verdict for $sha (PR #$pr, posted as $reviewer)"
