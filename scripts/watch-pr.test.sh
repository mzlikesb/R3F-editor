#!/usr/bin/env bash
# Checks watch-pr.sh's author trust classification (exact logins only).
set -uo pipefail
cd "$(dirname "$0")"
eval "$(sed -n '/^role()/,/^}/p' watch-pr.sh)"
fail=0
expect() { # expect <login> <role>
  local got
  got=$(role "$1")
  if [ "$got" = "$2" ]; then echo "ok   $1 → $got"; else echo "FAIL $1 → $got (want $2)"; fail=1; fi
}
expect 'chatgpt-codex-connector[bot]' codex
expect 'chatgpt-codex-connector-attacker' untrusted
expect 'chatgpt-codex-connector' untrusted
expect 'github-actions[bot]' ci
expect 'github-actions' untrusted
expect chillingdaisy-worker1 ai-reviewer
expect chillingdaisy-worker1x untrusted
expect mzlikesb user
expect someone-else untrusted
exit $fail
