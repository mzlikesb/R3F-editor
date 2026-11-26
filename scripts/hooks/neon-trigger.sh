#!/usr/bin/env bash
# PostToolUse hook (Bash): after `gh pr create` or `git push`, start a neon plan review in the
# background when the branch's PR is in `stage:plan-review` and a plan file changed since the
# last neon review. Never blocks or fails the session.
# NEON_TRIGGER_DRY_RUN=1 prints the decision instead of starting the review.
set -uo pipefail
# shellcheck source=scripts/hooks/lib.sh
source "$(dirname "$0")/lib.sh"

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
cwd=${cwd:-$PWD}

say() { [ "${NEON_TRIGGER_DRY_RUN:-}" = 1 ] && echo "neon-trigger: $*"; return 0; }

# The directory the push/PR command actually ran in (follows `cd X &&` and `git -C X`).
dir=$(dir_for "$cwd" "$cmd" '^\s*(git(\s+-C\s+\S+)?\s+push\b|gh\s+pr\s+create\b)')
[ -n "$dir" ] || exit 0
cd "$dir" 2>/dev/null || exit 0
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0
branch=$(git symbolic-ref --short -q HEAD) || exit 0
[ "$branch" != main ] || exit 0

pr_json=$(gh pr view "$branch" --json number,state,labels 2>/dev/null) || { say "no PR for $branch"; exit 0; }
pr=$(jq -r .number <<<"$pr_json")
[ "$(jq -r .state <<<"$pr_json")" = OPEN ] || { say "PR #$pr not open"; exit 0; }
jq -e '[.labels[].name] | index("stage:plan-review")' <<<"$pr_json" >/dev/null || {
  say "PR #$pr not in stage:plan-review"
  exit 0
}

# Last reviewed commit per branch, kept outside the work tree.
state_dir="$(git rev-parse --git-common-dir)/neon"
mkdir -p "$state_dir"
state_file="$state_dir/${branch//\//_}"
head=$(git rev-parse HEAD)
base=$(cat "$state_file" 2>/dev/null || git merge-base origin/main HEAD 2>/dev/null || echo "")
[ -n "$base" ] || exit 0
[ "$base" != "$head" ] || { say "already reviewed $head"; exit 0; }
running="$state_file.running"
if [ -f "$running" ] && [ "$(cat "$running")" = "$head" ]; then
  say "review of ${head:0:7} already running"
  exit 0
fi

plan=$(git diff --name-only "$base" "$head" -- 'docs/plans/' |
  grep -E '^docs/plans/[0-9]{3}-[^/]+\.md$' | grep -vE -- '-(tasks|qa)\.md$' | head -1 || true)
[ -n "$plan" ] && [ -f "$plan" ] || { say "no plan change in ${base:0:7}..${head:0:7}"; exit 0; }

if [ "${NEON_TRIGGER_DRY_RUN:-}" = 1 ]; then
  say "would review PR #$pr with $plan at ${head:0:7}"
  exit 0
fi

echo "$head" >"$running"
log="$state_dir/${branch//\//_}.log"
(
  # Mark the commit reviewed only after the review (or its skipped notice) was posted.
  if scripts/neon-review.sh "$pr" "$plan" >"$log" 2>&1; then
    echo "$head" >"$state_file"
    title="OUTPOST · neon 리뷰 완료"
  else
    title="OUTPOST · neon 리뷰 실패 (다음 push 때 다시 시도)"
  fi
  rm -f "$running"
  command -v herdr >/dev/null 2>&1 &&
    herdr notification show "$title" --body "PR #$pr · $(tail -1 "$log")" --sound done >/dev/null 2>&1
) </dev/null >/dev/null 2>&1 &
disown 2>/dev/null || true
exit 0
