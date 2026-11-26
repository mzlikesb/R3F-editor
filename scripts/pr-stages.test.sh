#!/usr/bin/env bash
# Checks pr-stages.jq on a fixed timeline (no network).
set -uo pipefail
cd "$(dirname "$0")"
fail=0
check() { # check <name> <want-json> <fixture>
  local got
  got=$(jq -c -f pr-stages.jq <<<"$3") || { echo "FAIL $1: jq error"; fail=1; return; }
  if [ "$got" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1"; echo " got  $got"; echo " want $2"; fail=1; fi
}
lab() { printf '{"event":"%s","created_at":"2026-11-26T%sZ","label":{"name":"%s"},"actor":{"login":"chillingdaisy-worker1"}}' "$1" "$2" "$3"; }
com() { printf '{"event":"committed","committer":{"date":"2026-11-26T%sZ"}}' "$1"; }
cmt() { printf '{"event":"commented","created_at":"2026-11-26T%sZ","user":{"login":"%s"},"body":%s}' "$1" "$2" "$(jq -Rn --arg b "$3" '$b')"; }
rev() { printf '{"event":"reviewed","submitted_at":"2026-11-26T%sZ","user":{"login":"%s"},"state":"%s","body":%s}' "$1" "$2" "$3" "$(jq -Rn --arg b "${4:-}" '$b')"; }

# A large PR through every stage: plan 10:00–10:20, dev 10:20–10:50, qa 10:50–11:00,
# code-review 11:00–merge 11:30. Codex receipt 11:10, a fix commit 11:15, user Approve 11:22.
check "full chain" \
  '{"number":9,"title":"t","stages":{"code-review":{"min":30,"commits":1},"dev":{"min":30,"commits":2},"plan-review":{"min":20,"commits":2},"qa":{"min":10,"commits":1}},"intervals":[{"stage":"plan-review","start":1795687200,"end":1795688400},{"stage":"dev","start":1795688400,"end":1795690200},{"stage":"qa","start":1795690200,"end":1795690800},{"stage":"code-review","start":1795690800,"end":1795692600}],"wait_plan_min":8,"wait_approve_min":7}' \
  "{\"pr\":{\"number\":9,\"title\":\"t\",\"merged_at\":\"2026-11-26T11:30:00Z\"},\"timeline\":[
    $(com 09:59:00), $(lab labeled 10:00:00 stage:plan-review),
    $(cmt 10:05:00 'chatgpt-codex-connector[bot]' '<!-- codex-review-receipt:v1 -->'),
    $(com 10:10:00),
    $(cmt 10:12:00 chillingdaisy-worker1 '## neon review · `abc`'),
    $(cmt 10:13:00 chillingdaisy-worker1 '@codex review'),
    $(lab unlabeled 10:20:00 stage:plan-review), $(lab labeled 10:20:00 stage:dev),
    $(com 10:30:00), $(com 10:40:00),
    $(lab unlabeled 10:50:00 stage:dev), $(lab labeled 10:50:00 stage:qa),
    $(com 10:55:00),
    $(lab unlabeled 11:00:00 stage:qa), $(lab labeled 11:00:00 stage:code-review),
    $(rev 11:05:00 mzlikesb dismissed),
    $(rev 11:10:00 'chatgpt-codex-connector[bot]' commented '<!-- codex-review-receipt:v1 -->'),
    $(com 11:15:00),
    $(rev 11:22:00 mzlikesb approved),
    $(cmt 11:25:00 someone-else '<!-- codex-review-receipt:v1 -->')
  ]}"

# A small PR: code-review only, Approve before Codex (wait measured from the last commit).
check "small, approve before codex" \
  '{"number":8,"title":"s","stages":{"code-review":{"min":2,"commits":1}},"intervals":[{"stage":"code-review","start":1795694400,"end":1795694520}],"wait_plan_min":null,"wait_approve_min":1}' \
  "{\"pr\":{\"number\":8,\"title\":\"s\",\"merged_at\":\"2026-11-26T12:02:00Z\"},\"timeline\":[
    $(com 11:59:00), $(lab labeled 12:00:00 stage:code-review),
    $(rev 12:00:00 mzlikesb approved),
    $(cmt 12:05:00 'chatgpt-codex-connector[bot]' '<!-- codex-review-receipt:v1 -->')
  ]}"

# Not merged yet: open stages have no end, no Approve.
check "open PR" \
  '{"number":3,"title":"o","stages":{},"intervals":[{"stage":"dev","start":1795687200,"end":null}],"wait_plan_min":null,"wait_approve_min":null}' \
  "{\"pr\":{\"number\":3,\"title\":\"o\",\"merged_at\":null},\"timeline\":[$(lab labeled 10:00:00 stage:dev)]}"

exit $fail
