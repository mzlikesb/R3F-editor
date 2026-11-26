#!/usr/bin/env bash
# Checks guard-bash.sh against the main checkout and a temporary worktree on main.
set -uo pipefail
cd "$(dirname "$0")/../.."
guard=scripts/hooks/guard-bash.sh
fail=0

expect() { # expect <exit> <cwd> <command>
  local want=$1 dir=$2 cmd=$3 got
  jq -n --arg c "$cmd" --arg d "$dir" '{tool_input:{command:$c},cwd:$d}' | "$guard" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then echo "ok   [$got] $cmd"; else echo "FAIL [$got≠$want] $cmd ($dir)"; fail=1; fi
}

# The main checkout, even when this test runs from a worktree.
main_dir=$(cd "$(git rev-parse --git-common-dir)/.." && pwd -P)
expect 0 "$main_dir" "git status"
expect 0 "$main_dir" "git switch main"
expect 0 "$main_dir" "git checkout main"
expect 2 "$main_dir" "git push --force"
expect 2 "$main_dir" "git push origin main"
expect 2 "$main_dir" "git push -uf origin feat/x"
expect 2 "$main_dir" "git push origin HEAD:main"
expect 0 "$main_dir" "git push origin main-xyz"
expect 0 "$main_dir" "git push --follow-tags origin feat/x"
expect 0 "$main_dir" "git commit -m 'catch -uf pushes to main' && git push -q"
expect 2 "$main_dir" "git add . && git push -f"
expect 2 "$main_dir" "git push origin HEAD:refs/heads/main"
expect 2 "$main_dir" "gh pr merge 1 --admin --squash"
expect 0 "$main_dir" "gh pr merge 1 --squash --auto"
expect 2 "$main_dir" "git switch feat/x"
expect 2 "$main_dir" "git checkout feat/x"
expect 2 "$main_dir" "git checkout -b feat/x"
expect 0 "$main_dir" "git checkout -- src/App.tsx"
expect 2 "$main_dir" "gh pr edit 1 --add-label user-approved"
expect 2 "$main_dir" "gh pr edit 1 --add-label size:small,user-approved"
expect 2 "$main_dir" "gh api repos/o/r/issues/1/labels -f labels[]=user-approved"
expect 0 "$main_dir" "gh pr comment 1 --body 'user-approved 라벨을 달아 주세요'"
expect 2 "$main_dir" "gh pr comment 1 --body '## neon review · abc'"
expect 0 "$main_dir" "scripts/neon-review.sh 1 docs/plans/001-harness.md"
expect 2 "$main_dir" "git add -f .dev.vars"
expect 0 "$main_dir" "git add .dev.vars.example"
expect 0 "$main_dir" "git worktree add ../outpost-x -b feat/x origin/main"
expect 0 "$main_dir" "git push -u origin feat/x"

# A worktree on main: branch switching is allowed there, committing on main is not.
if git show-ref --verify -q refs/heads/main && ! git worktree list | grep -q '\[main\]'; then
  wt=$(mktemp -d)/wt
  git worktree add -q "$wt" main
  expect 2 "$wt" "git commit -m x"
  expect 2 "$wt" "git push"
  expect 0 "$wt" "git switch -c feat/y"
  expect 0 "$wt" "git checkout feat/y"
  # The real directory is followed through `cd X &&` and `git -C X`.
  expect 0 "$main_dir" "cd $wt && git switch -c feat/z"
  expect 2 "$main_dir" "cd $wt && git commit -m x"
  expect 2 "$main_dir" "git -C $wt commit -m x"
  expect 2 "$wt" "cd $main_dir && git switch feat/x"
  git worktree remove --force "$wt"
else
  echo "skip worktree cases (main is checked out elsewhere)"
fi

exit $fail
