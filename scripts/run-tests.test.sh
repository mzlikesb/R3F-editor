#!/usr/bin/env bash
# Checks run-tests.sh against a fake folder (the real scripts/ is not scanned, so no recursion).
set -uo pipefail
cd "$(dirname "$0")"
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/pass/sub" "$tmp/pass/node_modules/x" "$tmp/pass/testdata"
printf 'echo pass-b\n' >"$tmp/pass/b.test.sh"
printf 'echo pass-a\n' >"$tmp/pass/sub/a.test.sh"
printf "import {test} from 'node:test';\ntest('m',()=>{});\n" >"$tmp/pass/c.test.mjs"
printf 'exit 1\n' >"$tmp/pass/node_modules/x/skip.test.sh"
printf 'exit 1\n' >"$tmp/pass/testdata/skip.test.sh"

out=$(bash run-tests.sh "$tmp/pass" 2>&1); rc=$?
[ $rc -eq 0 ] && ok "all pass exits 0" || bad "all pass exits 0 (rc=$rc)"
grep -q '3 files, 0 failed' <<<"$out" && ok "counts 3 files, skips node_modules/testdata" || bad "count"
[ "$(grep -n '^ok ' <<<"$out" | head -1 | grep -c 'b.test.sh')" -eq 1 ] && ok "name order" || bad "name order"

mkdir -p "$tmp/fail"
printf 'echo fine\n' >"$tmp/fail/a.test.sh"
printf 'exit 3\n' >"$tmp/fail/b.test.sh"
printf "import {test} from 'node:test';\ntest('m',()=>{throw new Error('x')});\n" >"$tmp/fail/c.test.mjs"
out=$(bash run-tests.sh "$tmp/fail" 2>&1); rc=$?
[ $rc -ne 0 ] && ok "failure exits non-zero" || bad "failure exits non-zero"
grep -q 'FAIL .*b.test.sh' <<<"$out" && grep -q 'FAIL .*c.test.mjs' <<<"$out" && grep -q 'ok   .*a.test.sh' <<<"$out" \
  && ok "per-file summary" || bad "per-file summary"
grep -q '3 files, 2 failed' <<<"$out" && ok "runs past failure" || bad "runs past failure"

exit $fail
