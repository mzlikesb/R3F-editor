#!/usr/bin/env bash
# Checks codex-gate.sh on fake comments and reviews (no network).
set -uo pipefail
cd "$(dirname "$0")"
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
HEAD=c9eb9795374a1b2c3d4e5f60718293a4b5c6d7e8
OLD=1111111222222233333334444444555555566666

user() { jq -n --arg l "$1" --arg b "$2" '{user:{login:$l},body:$b}'; }
receipt() { printf '<!-- codex-review-receipt:v1 -->\n\nCodex Review: ok.\n\n**Reviewed commit:** `%s`\n' "$1"; }
state() { printf '<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 {"code_review":{"commit_sha":"%s","has_any_findings":false,"status":"%s"},"security_review":{"commit_sha":null}} -->\n' "$1" "$2"; }
check() { # check <name> <want-state> <comments-array> <reviews-array>
  echo "$3" >"$tmp/c.json"; echo "$4" >"$tmp/r.json"
  local got
  got=$(bash codex-gate.sh "$HEAD" "$tmp/c.json" "$tmp/r.json" | jq -r .state)
  if [ "$got" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1 (got $got, want $2)"; fail=1; fi
}
BOT='chatgpt-codex-connector[bot]'

check "no comments" pending '[]' '[]'
check "receipt for an old commit only" pending "[$(user "$BOT" "$(receipt "${OLD:0:10}")")]" '[]'
check "receipt for head (10 chars)" success "[$(user "$BOT" "$(receipt "${HEAD:0:10}")")]" '[]'
check "old receipt then head receipt" success "[$(user "$BOT" "$(receipt "${OLD:0:10}")"),$(user "$BOT" "$(receipt "${HEAD:0:10}")")]" '[]'
check "receipt in a review body" success '[]' "[$(user "$BOT" "$(receipt "${HEAD:0:7}")")]"
check "same words from another author" pending "[$(user someone-else "$(receipt "${HEAD:0:10}")"),$(user mzlikesb "$(receipt "${HEAD:0:10}")")]" "[$(user chillingdaisy-worker1 "$(receipt "${HEAD:0:10}")")]"
check "lookalike bot name" pending "[$(user 'chatgpt-codex-connector[bot]x' "$(receipt "${HEAD:0:10}")")]" '[]'
check "state summary only (completed, full sha)" success "[$(user "$BOT" "$(state "$HEAD" completed)")]" '[]'
check "state summary in progress" pending "[$(user "$BOT" "$(state "$HEAD" in_progress)")]" '[]'
check "state summary for an old commit" pending "[$(user "$BOT" "$(state "$OLD" completed)")]" '[]'
check "state summary from another author" pending "[$(user someone-else "$(state "$HEAD" completed)")]" '[]'
check "short sha 6 chars" pending "[$(user "$BOT" "$(receipt "${HEAD:0:6}")")]" '[]'
check "marker without commit line" pending "[$(user "$BOT" '<!-- codex-review-receipt:v1 -->')]" '[]'
check "commit line without marker" pending "[$(user "$BOT" "**Reviewed commit:** \`${HEAD:0:10}\`")]" '[]'
check "review with findings still counts" success '[]' "[$(user "$BOT" "$(receipt "${HEAD:0:10}")

P1 something is wrong")]"
check "null bodies" pending '[{"user":{"login":"x"},"body":null}]' '[{"user":{"login":"x"},"body":null}]'

# Description names the head or the reviewed commit.
echo '[]' >"$tmp/c.json"; echo '[]' >"$tmp/r.json"
d=$(bash codex-gate.sh "$HEAD" "$tmp/c.json" "$tmp/r.json" | jq -r .description)
case "$d" in *c9eb979*"@codex review"*) echo "ok   pending description";; *) echo "FAIL description: $d"; fail=1;; esac
exit $fail
