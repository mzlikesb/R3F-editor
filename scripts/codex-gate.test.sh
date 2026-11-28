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
d=$(cd "$tmp" && bash "$OLDPWD/codex-gate.sh" "$HEAD" c.json r.json | jq -r .description)
case "$d" in *c9eb979*"@codex review"*) echo "ok   pending description";; *) echo "FAIL description: $d"; fail=1;; esac
# --- base dev (plan 010 B2 / tasks R2) -------------------------------------------
# codex-gate.sh <head> <comments> <reviews> <base> <review-comments>
CLEAN_RECEIPT() { printf "<!-- codex-review-receipt:v1 -->\n\nCodex Review: Didn't find any major issues. Nice work!\n\n**Reviewed commit:** \`%s\`\n" "$1"; }
FIND_RECEIPT() { printf '<!-- codex-review-receipt:v1 -->\n\n### 💡 Codex Review\n\nHere are some automated review suggestions for this pull request.\n\n**Reviewed commit:** `%s`\n' "$1"; }
cmt() { jq -n --arg l "$1" --arg b "$2" --arg t "$3" '{user:{login:$l},body:$b,created_at:$t}'; }
rev() { # rev <id> <login> <state> <commit> <time> <body>
  jq -n --argjson id "$1" --arg l "$2" --arg s "$3" --arg c "$4" --arg t "$5" --arg b "$6" \
    '{id:$id,user:{login:$l},state:$s,commit_id:$c,submitted_at:$t,body:$b}'
}
inline() { jq -n --argjson r "$1" --arg c "$2" '{pull_request_review_id:$r,commit_id:$c,user:{login:"chatgpt-codex-connector[bot]"},body:"P1 something"}'; }
dcheck() { # dcheck <name> <want-state> <base> <comments> <reviews> <review-comments>
  echo "$4" >"$tmp/c.json"; echo "$5" >"$tmp/r.json"; echo "$6" >"$tmp/rc.json"
  local got
  got=$(bash codex-gate.sh "$HEAD" "$tmp/c.json" "$tmp/r.json" "$3" "$tmp/rc.json" | jq -r .state)
  if [ "$got" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1 (got $got, want $2)"; fail=1; fi
}
T1=2026-11-28T09:00:00Z T2=2026-11-28T09:10:00Z T3=2026-11-28T09:20:00Z
CLEAN_C=$(cmt "$BOT" "$(CLEAN_RECEIPT "${HEAD:0:10}")" "$T2")
FIND_R=$(rev 11 "$BOT" COMMENTED "$HEAD" "$T1" "$(FIND_RECEIPT "${HEAD:0:10}")")
APPROVE=$(rev 21 mzlikesb APPROVED "$HEAD" "$T3" "")

dcheck "dev: clean receipt (no findings) -> success" success dev "[$CLEAN_C]" '[]' '[]'
dcheck "dev: latest review has inline findings -> pending" pending dev '[]' "[$FIND_R]" "[$(inline 11 "$HEAD")]"
dcheck "dev: findings earlier, latest clean -> success" success dev "[$CLEAN_C]" "[$FIND_R]" "[$(inline 11 "$HEAD")]"
dcheck "dev: clean earlier, findings latest -> pending" pending dev "[$(cmt "$BOT" "$(CLEAN_RECEIPT "${HEAD:0:10}")" "$T1")]" "[$(rev 12 "$BOT" COMMENTED "$HEAD" "$T2" "$(FIND_RECEIPT "${HEAD:0:10}")")]" "[$(inline 12 "$HEAD")]"
dcheck "dev: no inline but summary lists findings -> pending" pending dev '[]' "[$FIND_R]" '[]'
dcheck "dev: findings on old head, clean on new head -> success" success dev "[$CLEAN_C]" "[$(rev 13 "$BOT" COMMENTED "$OLD" "$T1" "$(FIND_RECEIPT "${OLD:0:10}")")]" "[$(inline 13 "$OLD")]"
dcheck "dev: clean receipt only for old head -> pending" pending dev "[$(cmt "$BOT" "$(CLEAN_RECEIPT "${OLD:0:10}")" "$T2")]" '[]' '[]'
dcheck "dev: no Codex review -> pending" pending dev '[]' '[]' '[]'
dcheck "dev: findings + user Approve on head -> success" success dev '[]' "[$FIND_R,$APPROVE]" "[$(inline 11 "$HEAD")]"
dcheck "dev: user Approve without Codex review -> pending" pending dev '[]' "[$APPROVE]" '[]'
dcheck "dev: Codex review only in progress + Approve -> pending" pending dev "[$(user "$BOT" "$(state "$HEAD" in_progress)")]" "[$APPROVE]" '[]'
dcheck "dev: Approve on old head + findings on head -> pending" pending dev '[]' "[$FIND_R,$(rev 22 mzlikesb APPROVED "$OLD" "$T3" "")]" "[$(inline 11 "$HEAD")]"
dcheck "dev: Approve from someone else -> pending" pending dev '[]' "[$FIND_R,$(rev 23 someone-else APPROVED "$HEAD" "$T3" "")]" "[$(inline 11 "$HEAD")]"
dcheck "dev: Approve then dismissed -> pending" pending dev '[]' "[$FIND_R,$(rev 24 mzlikesb DISMISSED "$HEAD" "$T3" "")]" "[$(inline 11 "$HEAD")]"
dcheck "dev: Approve then changes requested -> pending" pending dev '[]' "[$FIND_R,$APPROVE,$(rev 25 mzlikesb CHANGES_REQUESTED "$HEAD" 2026-11-28T09:30:00Z "")]" "[$(inline 11 "$HEAD")]"
dcheck "dev: state summary completed, no findings -> success" success dev "[$(user "$BOT" "$(state "$HEAD" completed)")]" '[]' '[]'
dcheck "dev: state summary says findings -> pending" pending dev "[$(user "$BOT" "$(state "$HEAD" completed | sed 's/"has_any_findings":false/"has_any_findings":true/')")]" '[]' '[]'
dcheck "dev: clean words from another author -> pending" pending dev "[$(cmt someone-else "$(CLEAN_RECEIPT "${HEAD:0:10}")" "$T2")]" '[]' '[]'
dcheck "main: findings still count as reviewed" success main '[]' "[$FIND_R]" "[$(inline 11 "$HEAD")]"
dcheck "main: Approve alone is not a review" pending main '[]' "[$APPROVE]" '[]'

# base dev without the inline list fails closed.
echo "[$CLEAN_C]" >"$tmp/c.json"; echo '[]' >"$tmp/r.json"
got=$(bash codex-gate.sh "$HEAD" "$tmp/c.json" "$tmp/r.json" dev | jq -r .state)
if [ "$got" = pending ]; then echo "ok   dev without review-comments file"; else echo "FAIL dev without review-comments file ($got)"; fail=1; fi
exit $fail
