#!/usr/bin/env bash
# PreToolUse guard for Bash commands. Exit 2 blocks the command and shows the reason to the agent.
set -uo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
cwd=${cwd:-$PWD}

block() {
  echo "차단됨: $1" >&2
  exit 2
}

# Only look at git/gh commands.
grep -qE '(^|[;&|(]|\s)(git|gh)\s' <<<"$cmd" || exit 0

# Agents never add the user's approval label. Mentioning it in text (comments, docs) is fine.
if grep -qE -- '--add-label[ =]+["'\'']?[^ ]*user-approved' <<<"$cmd" ||
  { grep -qE '\bgh\s+api\b' <<<"$cmd" && grep -qE '/labels\b' <<<"$cmd" && grep -q 'user-approved' <<<"$cmd" && ! grep -qE -- '-X\s*DELETE' <<<"$cmd"; }; then
  block "'user-approved' 라벨은 사용자만 단다."
fi

in_repo=$(git -C "$cwd" rev-parse --is-inside-work-tree 2>/dev/null || echo false)
[ "$in_repo" = true ] || exit 0
branch=$(git -C "$cwd" symbolic-ref --short -q HEAD 2>/dev/null || echo "")
git_dir=$(cd "$cwd" && realpath "$(git rev-parse --git-dir)")
common_dir=$(cd "$cwd" && realpath "$(git rev-parse --git-common-dir)")
main_checkout=false
[ "$git_dir" = "$common_dir" ] && main_checkout=true

# Force push, in any form.
if grep -qE '\bgit\s+push\b' <<<"$cmd" && grep -qE '(\s-f\b|--force\b|--force-with-lease|\s\+[^ ]+)' <<<"$cmd"; then
  block "force push 금지."
fi

# Pushing to main explicitly, or committing/pushing while on main.
if grep -qE '\bgit\s+push\b.*(\smain\b|:main\b)' <<<"$cmd"; then
  block "main으로 직접 push 금지. PR로 머지한다."
fi
if [ "$branch" = main ] && grep -qE '\bgit\s+(commit|push)\b' <<<"$cmd"; then
  block "main 브랜치에서 commit/push 금지. 작업 브랜치(worktree)에서 한다."
fi

# Switching branches in the main checkout. File restores (`git checkout -- path`) are fine.
if [ "$main_checkout" = true ]; then
  if grep -qE '\bgit\s+switch\b' <<<"$cmd" ||
    { grep -qE '\bgit\s+checkout\b' <<<"$cmd" && ! grep -qE '\bgit\s+checkout\s+(\S+\s+)?--(\s|$)' <<<"$cmd"; }; then
    block "메인 체크아웃에서 브랜치 전환 금지. 'git worktree add ../outpost-<주제> -b <브랜치> origin/main'을 쓴다."
  fi
fi

# Secrets: never force-add or commit them.
secret_re='(^|/)(\.dev\.vars|\.env(\..*)?)$|\.pem$|\.key$'
if grep -qE '\bgit\s+add\b' <<<"$cmd" && grep -qE '(\.dev\.vars|\.env\b|\.pem\b)' <<<"$cmd" && ! grep -q '\.example' <<<"$cmd"; then
  block "시크릿 파일은 git에 넣지 않는다."
fi
if grep -qE '\bgit\s+commit\b' <<<"$cmd"; then
  staged=$(git -C "$cwd" diff --cached --name-only 2>/dev/null | grep -E "$secret_re" | grep -v '\.example$' || true)
  [ -z "$staged" ] || block "스테이지에 시크릿 파일이 있다: $staged"
fi

exit 0
