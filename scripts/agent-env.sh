#!/usr/bin/env bash
# Checks that this shell acts as the agent account: gh, git push credentials, HTTPS remote.
# Run by the SessionStart hook; prints one line per check and exits 1 if any fails.
# Usage: scripts/agent-env.sh [--quiet]
set -uo pipefail
source "$(dirname "$0")/hooks/lib.sh"
quiet=${1:-}
fail=0
say() { [ "$quiet" = --quiet ] || echo "$*"; }
check() { # check <ok?> <label> <detail>
  if [ "$1" = 0 ]; then say "ok   $2"; else echo "FAIL $2 — $3"; fail=1; fi
}

agent_gh_ok
check $? "gh 설정 → ${AGENT_LOGIN}" "GH_CONFIG_DIR(${GH_CONFIG_DIR:-미설정})에 ${AGENT_LOGIN} 로그인이 없다"

who=$(gh api user -q .login 2>/dev/null || echo "?")
[ "$who" = "$AGENT_LOGIN" ]
check $? "gh 실제 계정: ${who}" "${AGENT_LOGIN}이 아니다"

agent_git_ok
check $? "git push 자격 증명 → gh" "GIT_CONFIG_*에 credential.https://github.com.helper='!gh auth git-credential'이 없다"

remote=$(git remote get-url origin 2>/dev/null || echo "")
case "$remote" in https://github.com/*) r=0 ;; *) r=1 ;; esac
check $r "origin: ${remote:-없음}" "HTTPS가 아니면 push 자격 증명 설정이 적용되지 않는다"

cred=$(printf 'protocol=https\nhost=github.com\n\n' | GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null | sed -n 's/^username=//p')
[ "$cred" = "$AGENT_LOGIN" ] || [ "$cred" = "x-access-token" ] && [ -n "$cred" ]
r=$?
# `gh auth git-credential` may report the token user as the login or as x-access-token;
# either way the token comes from the agent gh config checked above.
check $r "git credential: ${cred:-없음}" "push가 ${AGENT_LOGIN}이 아닌 계정으로 나갈 수 있다"

exit $fail
