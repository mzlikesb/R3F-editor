#!/usr/bin/env bash
# PreToolUse guard for file-editing tools (Write, Edit, MultiEdit, NotebookEdit).
# The main checkout is read-only for agents: edits happen in a worktree and reach main
# through a PR and the user's Approve. Only paths are compared; nothing is parsed.
set -uo pipefail

input=$(cat)
path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
[ -n "$path" ] || exit 0
cwd=$(jq -r '.cwd // empty' <<<"$input")
main=${GUARD_MAIN_CHECKOUT:-${CLAUDE_PROJECT_DIR:-}}
[ -n "$main" ] || exit 0

# The main checkout is the repo whose .git is a directory (worktrees have a .git file).
main=$(cd "$main" 2>/dev/null && pwd -P) || exit 0
case "$path" in /*) ;; *) path="${cwd:-$PWD}/$path" ;; esac
# Resolve the nearest existing parent (the file itself may not exist yet).
dir=$(dirname "$path")
while [ ! -d "$dir" ] && [ "$dir" != / ]; do dir=$(dirname "$dir"); done
real="$(cd "$dir" && pwd -P)/${path#"$dir"/}"
[ "$dir" = "$(dirname "$path")" ] && real="$(cd "$dir" && pwd -P)/$(basename "$path")"

case "$real/" in
  "$main"/*)
    echo "차단됨: 메인 체크아웃($main)의 파일은 고치지 않는다. 'git worktree add ../outpost-<주제> -b <브랜치> origin/main'에서 고치고 PR로 올린다. (${real#"$main"/})" >&2
    exit 2
    ;;
esac
exit 0
