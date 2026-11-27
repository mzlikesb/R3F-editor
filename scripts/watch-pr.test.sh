#!/usr/bin/env bash
# Checks watch-pr.sh's author trust classification (exact logins only).
set -uo pipefail
cd "$(dirname "$0")"
eval "$(sed -n '/^role()/,/^}/p' watch-pr.sh)"
fail=0
expect() { # expect <login> <body> <role>
  local got
  got=$(role "$1" "$2")
  if [ "$got" = "$3" ]; then echo "ok   $1 → $got"; else echo "FAIL $1 → $got (want $3)"; fail=1; fi
}
expect 'chatgpt-codex-connector[bot]' '' codex
expect 'chatgpt-codex-connector-attacker' '' untrusted
expect 'chatgpt-codex-connector' '' untrusted
expect 'github-actions[bot]' '' ci
expect 'github-actions' '' untrusted
expect chillingdaisy-worker1 '## neon review · `abc`' neon
expect chillingdaisy-worker1 '## neon art critique · `abc`' neon
expect chillingdaisy-worker1 '반영. ## neon art critique' agent
expect chillingdaisy-worker1 '@codex review — 대상 커밋' agent
expect chillingdaisy-worker1 '반영했습니다. ## neon review' agent
expect chillingdaisy-worker1x '## neon review' untrusted
expect mzlikesb '' user
expect someone-else '## neon review' untrusted
exit $fail
