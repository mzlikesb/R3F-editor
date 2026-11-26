#!/usr/bin/env bash
# Checks pr-tokens.jq on hand-made rows (no network, no real session logs).
set -uo pipefail
cd "$(dirname "$0")"
fail=0
check() { # check <name> <want-json> <fixture>
  local got
  got=$(jq -c -f pr-tokens.jq <<<"$3") || { echo "FAIL $1: jq error"; fail=1; return; }
  if [ "$got" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1"; echo " got  $got"; echo " want $2"; fail=1; fi
}
# row <id> <time> <branch> <role> <model> <in> <out> <cache-read> <cache-write>
row() {
  printf '{"id":"%s","ts":"2026-11-26T%s.123Z","branch":"%s","role":"%s","model":"%s","u":{"input_tokens":%s,"output_tokens":%s,"cache_read_input_tokens":%s,"cache_creation_input_tokens":%s}}' "$@"
}
t0=$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' 2026-11-26T10:00:00Z +%s 2>/dev/null || date -u -d 2026-11-26T10:00:00Z +%s)
iv="[{\"stage\":\"plan-review\",\"start\":$t0,\"end\":$((t0 + 1200))},{\"stage\":\"dev\",\"start\":$((t0 + 1200)),\"end\":$((t0 + 3000))}]"
pr="{\"number\":9,\"title\":\"t\",\"branch\":\"feat/9\",\"intervals\":$iv}"

# The same message id repeats (keep the last), stages split by time, roles and models split,
# other branches ignored, row before the first stage joins it, row after merge is its own bucket.
check "dedupe, stages, roles" \
  '[{"pr":9,"title":"t","stage":"dev","role":"dev (sonnet-5-5)","input":3,"output":40,"cache_read":500,"cache_write":60},{"pr":9,"title":"t","stage":"plan-review","role":"main session (opus-5-5)","input":3,"output":30,"cache_read":300,"cache_write":30},{"pr":9,"title":"t","stage":"머지 후","role":"main session (opus-5-5)","input":1,"output":1,"cache_read":1,"cache_write":1}]' \
  "{\"prs\":[$pr],\"rows\":[
    $(row m1 09:59:00 feat/9 'main session' claude-opus-5-5 1 5 100 10),
    $(row m1 09:59:01 feat/9 'main session' claude-opus-5-5 1 10 100 10),
    $(row m2 10:05:00 feat/9 'main session' claude-opus-5-5 2 20 200 20),
    $(row m3 10:30:00 feat/9 dev claude-sonnet-5-5 3 40 500 60),
    $(row m4 10:30:00 feat/other dev claude-sonnet-5-5 9 9 9 9),
    $(row m5 10:31:00 feat/9 dev '<synthetic>' 0 0 0 0),
    $(row m6 11:00:00 feat/9 'main session' claude-opus-5-5 1 1 1 1)
  ]}"

# No stage labels: everything lands in the dash stage. No rows: empty result.
check "no stages" \
  '[{"pr":3,"title":"s","stage":"—","role":"qa (opus-5-5)","input":1,"output":2,"cache_read":3,"cache_write":4}]' \
  "{\"prs\":[{\"number\":3,\"title\":\"s\",\"branch\":\"b\",\"intervals\":[]}],\"rows\":[$(row a 10:00:00 b qa claude-opus-5-5 1 2 3 4)]}"
check "no rows" '[]' '{"prs":[{"number":3,"title":"s","branch":"b","intervals":[]}],"rows":[]}'

exit $fail
