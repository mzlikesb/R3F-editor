#!/usr/bin/env bash
# Checks guard-write.sh: edits inside the main checkout are blocked, worktrees and
# outside paths are allowed.
set -uo pipefail
guard="$(cd "$(dirname "$0")" && pwd -P)/guard-write.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

main="$tmp/main"
mkdir -p "$main/.claude" "$main/scripts/hooks" "$tmp/outpost-wt/src" "$tmp/elsewhere"
main=$(cd "$main" && pwd -P)

expect() { # expect <exit> <tool> <path> [cwd]
  local want=$1 tool=$2 path=$3 dir=${4:-$tmp} got
  jq -n --arg t "$tool" --arg p "$path" --arg d "$dir" \
    '{tool_name:$t, tool_input:{file_path:$p}, cwd:$d}' |
    GUARD_MAIN_CHECKOUT="$main" "$guard" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then echo "ok   [${got}] ${tool} ${path}"; else echo "FAIL [${got} != ${want}] ${tool} ${path}"; fail=1; fi
}

expect 2 Edit "$main/.claude/settings.json"
expect 2 Write "$main/scripts/hooks/guard-bash.sh"
expect 2 Write "$main/AGENTS.md"
expect 2 Write "$main/new-dir/new-file.txt"
expect 2 Edit ".claude/settings.local.json" "$main"
expect 2 Edit "$main/../main/AGENTS.md"
expect 0 Edit "$tmp/outpost-wt/src/App.tsx"
expect 0 Write "$tmp/outpost-wt/new.ts"
expect 0 Write "$tmp/elsewhere/notes.md"
expect 0 Write "$tmp/mainish/file.md"

# Without the override: the main checkout comes from git metadata, so a session started
# inside a worktree still protects the real main checkout and leaves the worktree editable.
repo="$tmp/repo"
git init -q -b main "$repo"
git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m base
git -C "$repo" worktree add -q -b feat/x "$tmp/repo-wt"
repo=$(cd "$repo" && pwd -P)
wt=$(cd "$tmp/repo-wt" && pwd -P)
expect_session() { # expect_session <exit> <session-dir> <path>
  local want=$1 session=$2 path=$3 got
  jq -n --arg p "$path" --arg d "$session" '{tool_name:"Edit", tool_input:{file_path:$p}, cwd:$d}' |
    env -u GUARD_MAIN_CHECKOUT CLAUDE_PROJECT_DIR="$session" "$guard" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then echo "ok   [${got}] session=${session##*/} ${path##*/}"; else echo "FAIL [${got} != ${want}] session=${session} ${path}"; fail=1; fi
}
expect_session 2 "$repo" "$repo/AGENTS.md"
expect_session 0 "$repo" "$wt/AGENTS.md"
expect_session 2 "$wt" "$repo/AGENTS.md"
expect_session 0 "$wt" "$wt/AGENTS.md"

exit $fail
