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
pr="{\"number\":9,\"title\":\"t\",\"branch\":\"feat/9\",\"opened\":$((t0 - 600)),\"closed\":$((t0 + 7200)),\"intervals\":$iv}"
pr2="{\"number\":12,\"title\":\"u\",\"branch\":\"feat/12\",\"opened\":$((t0 + 3600)),\"closed\":null,\"intervals\":[]}"
now=$((t0 + 86400))

# The same message id repeats (keep the last), stages split by time, roles and models split,
# rows of unrelated branches inside no PR period are dropped, a row before the first stage joins
# it, a row after the last stage is its own bucket.
check "dedupe, stages, roles" \
  '[{"pr":"#9","title":"t","link":"브랜치","stage":"dev","role":"dev (sonnet-5-5)","input":3,"output":40,"cache_read":500,"cache_write":60},{"pr":"#9","title":"t","link":"브랜치","stage":"plan-review","role":"main session (opus-5-5)","input":3,"output":30,"cache_read":300,"cache_write":30},{"pr":"#9","title":"t","link":"브랜치","stage":"머지 후","role":"main session (opus-5-5)","input":1,"output":1,"cache_read":1,"cache_write":1}]' \
  "{\"now\":$now,\"prs\":[$pr],\"rows\":[
    $(row m1 09:59:00 feat/9 'main session' claude-opus-5-5 1 5 100 10),
    $(row m1 09:59:01 feat/9 'main session' claude-opus-5-5 1 10 100 10),
    $(row m2 10:05:00 feat/9 'main session' claude-opus-5-5 2 20 200 20),
    $(row m3 10:30:00 feat/9 dev claude-sonnet-5-5 3 40 500 60),
    $(row m4 23:30:00 feat/other dev claude-sonnet-5-5 9 9 9 9),
    $(row m5 10:31:00 feat/9 dev '<synthetic>' 0 0 0 0),
    $(row m6 11:00:00 feat/9 'main session' claude-opus-5-5 1 1 1 1),
    $(row m7 23:59:00 main 'main session' claude-opus-5-5 5 5 5 5)
  ]}"

# main/HEAD rows go by time: one open PR -> that PR (stage by time); two open PRs -> one shared
# bucket counted once; a branch match wins over time (feat/9 row at 11:30 stays with #9).
check "time link, shared bucket, branch first" \
  '[{"pr":"#9","title":"t","link":"브랜치","stage":"머지 후","role":"dev (sonnet-5-5)","input":4,"output":4,"cache_read":4,"cache_write":4},{"pr":"#9","title":"t","link":"시간","stage":"plan-review","role":"main session (opus-5-5)","input":1,"output":2,"cache_read":3,"cache_write":4},{"pr":"동시 진행(#9 #12)","title":"","link":"시간","stage":"—","role":"main session (opus-5-5)","input":10,"output":10,"cache_read":10,"cache_write":10}]' \
  "{\"now\":$now,\"prs\":[$pr,$pr2],\"rows\":[
    $(row t1 10:05:00 main 'main session' claude-opus-5-5 1 2 3 4),
    $(row t2 11:30:00 HEAD 'main session' claude-opus-5-5 10 10 10 10),
    $(row t2 11:30:00 HEAD 'main session' claude-opus-5-5 10 10 10 10),
    $(row t3 11:30:00 feat/9 dev claude-sonnet-5-5 4 4 4 4)
  ]}"

# Rows of a known PR branch that is not in the queried set are dropped, never time-linked; an
# unknown branch still is. An open PR's current stage runs until now (not "머지 후").
pr3="{\"number\":13,\"title\":\"o\",\"branch\":\"feat/13\",\"opened\":$t0,\"closed\":null,\"intervals\":[{\"stage\":\"plan-review\",\"start\":$t0,\"end\":$((t0 + 1200))},{\"stage\":\"dev\",\"start\":$((t0 + 1200)),\"end\":null}]}"
check "known branch outside query dropped, open stage" \
  '[{"pr":"#13","title":"o","link":"브랜치","stage":"dev","role":"dev (sonnet-5-5)","input":1,"output":1,"cache_read":1,"cache_write":1},{"pr":"#13","title":"o","link":"시간","stage":"dev","role":"main session (opus-5-5)","input":2,"output":2,"cache_read":2,"cache_write":2}]' \
  "{\"now\":$now,\"known_branches\":[\"feat/13\",\"feat/12\"],\"prs\":[$pr3],\"rows\":[
    $(row o1 10:40:00 feat/13 dev claude-sonnet-5-5 1 1 1 1),
    $(row o2 10:40:00 feat/12 dev claude-sonnet-5-5 7 7 7 7),
    $(row o3 10:41:00 main 'main session' claude-opus-5-5 2 2 2 2)
  ]}"

check "no stages" \
  '[{"pr":"#3","title":"s","link":"브랜치","stage":"—","role":"qa (opus-5-5)","input":1,"output":2,"cache_read":3,"cache_write":4}]' \
  "{\"now\":$now,\"prs\":[{\"number\":3,\"title\":\"s\",\"branch\":\"b\",\"opened\":0,\"closed\":null,\"intervals\":[]}],\"rows\":[$(row a 10:00:00 b qa claude-opus-5-5 1 2 3 4)]}"
check "no rows" '[]' '{"now":1,"prs":[{"number":3,"title":"s","branch":"b","opened":0,"closed":null,"intervals":[]}],"rows":[]}'

exit $fail
