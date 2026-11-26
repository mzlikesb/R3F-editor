#!/usr/bin/env bash
# PreToolUse guard for Bash commands. Exit 2 blocks the command and shows the reason to the agent.
set -uo pipefail
# shellcheck source=scripts/hooks/lib.sh
source "$(dirname "$0")/lib.sh"

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

# neon reviews are posted only through scripts/neon-review.sh, which uses the reviewer account.
if grep -qE '\bgh\s+(pr\s+(comment|review)|api)\b' <<<"$cmd" && grep -qi 'neon review' <<<"$cmd" &&
  ! grep -q 'scripts/neon-review.sh' <<<"$cmd"; then
  block "neon 리뷰는 'scripts/neon-review.sh <PR> <플랜>'으로만 올린다(리뷰어 계정으로 게시)."
fi

# Git state is read from the directory each command actually runs in (following `cd X &&`
# and `git -C X`), not the session's cwd.
git_opt='git(\s+-C\s+\S+)?'
repo_info() { # repo_info <dir>: sets branch and main_checkout; returns 1 outside a repo
  local d=$1
  [ "$(git -C "$d" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || return 1
  branch=$(git -C "$d" symbolic-ref --short -q HEAD 2>/dev/null || echo "")
  local gd cd_
  gd=$(cd "$d" && realpath "$(git rev-parse --git-dir)")
  cd_=$(cd "$d" && realpath "$(git rev-parse --git-common-dir)")
  main_checkout=false
  [ "$gd" = "$cd_" ] && main_checkout=true
  return 0
}

# Push flags are checked only on the `git push` segments themselves, so text such as a
# commit message that mentions "-f" or "main" does not trip the guard.
push_segments=$(split_segments "$cmd" | grep -E "^\s*${git_opt}\s+push\b" || true)
if [ -n "$push_segments" ]; then
  if grep -qE '(\s-[a-zA-Z]*f[a-zA-Z]*(\s|$)|--force\b|--force-with-lease|\s\+[^ ]+)' <<<"$push_segments"; then
    block "force push 금지."
  fi
  if grep -qE '(\smain|:main|:refs/heads/main)(\s|$)' <<<"$push_segments"; then
    block "main으로 직접 push 금지. PR로 머지한다."
  fi
fi

# Admin merges skip required checks (the server also refuses them: enforce_admins).
if split_segments "$cmd" | grep -qE '^\s*gh\s+pr\s+merge\b.*--admin\b'; then
  block "'gh pr merge --admin' 금지. 필수 체크와 승인을 거쳐 머지한다."
fi

d=$(dir_for "$cwd" "$cmd" "^\s*${git_opt}\s+(commit|push)\b")
if [ -n "$d" ] && repo_info "$d" && [ "$branch" = main ]; then
  block "main 브랜치에서 commit/push 금지. 작업 브랜치(worktree)에서 한다."
fi

# Switching branches in the main checkout. File restores (`git checkout -- path`) are fine.
d=$(dir_for "$cwd" "$cmd" "^\s*${git_opt}\s+(switch|checkout)\b")
if [ -n "$d" ] && repo_info "$d" && [ "$main_checkout" = true ]; then
  seg=$(split_segments "$cmd" | grep -E "^\s*${git_opt}\s+(switch|checkout)\b" | head -1)
  # Returning the main checkout to `main` is the one allowed switch.
  to_main=false
  grep -qE "${git_opt}\s+(switch|checkout)\s+main\s*$" <<<"$seg" && to_main=true
  if [ "$to_main" = false ] && { grep -qE "${git_opt}\s+switch\b" <<<"$seg" || ! grep -qE "${git_opt}\s+checkout\s+(\S+\s+)?--(\s|$)" <<<"$seg"; }; then
    block "메인 체크아웃에서 브랜치 전환 금지. 'git worktree add ../outpost-<주제> -b <브랜치> origin/main'을 쓴다."
  fi
fi

# Secrets: never force-add or commit them.
secret_re='(^|/)(\.dev\.vars|\.env(\..*)?)$|\.pem$|\.key$'
if grep -qE '\bgit\s+add\b' <<<"$cmd" && grep -qE '(\.dev\.vars|\.env\b|\.pem\b)' <<<"$cmd" && ! grep -q '\.example' <<<"$cmd"; then
  block "시크릿 파일은 git에 넣지 않는다."
fi
d=$(dir_for "$cwd" "$cmd" "^\s*${git_opt}\s+commit\b")
if [ -n "$d" ]; then
  staged=$(git -C "$d" diff --cached --name-only 2>/dev/null | grep -E "$secret_re" | grep -v '\.example$' || true)
  [ -z "$staged" ] || block "스테이지에 시크릿 파일이 있다: $staged"
fi

exit 0
