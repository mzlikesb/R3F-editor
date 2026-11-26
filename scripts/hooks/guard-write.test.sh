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

exit $fail
