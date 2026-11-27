#!/usr/bin/env bash
# Checks check-protection.sh on fake protection and repo JSON (no network).
set -uo pipefail
cd "$(dirname "$0")"
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

prot() { # prot <contexts-json> <strict> <approvals> <dismiss> <lastpush> <admins>
  jq -n --argjson c "$1" --argjson s "$2" --argjson a "$3" --argjson d "$4" --argjson l "$5" --argjson e "$6" '{
    required_status_checks:{contexts:$c,strict:$s},
    required_pull_request_reviews:{required_approving_review_count:$a,dismiss_stale_reviews:$d,require_last_push_approval:$l},
    enforce_admins:{enabled:$e}}'
}
repo() { jq -n --argjson s "$1" --argjson m "$2" --argjson r "$3" '{allow_squash_merge:$s,allow_merge_commit:$m,allow_rebase_merge:$r}'; }
check() { # check <name> <want-exit> <want-substring> <prot> <repo>
  echo "$4" >"$tmp/p.json"; echo "$5" >"$tmp/r.json"
  local out code
  out=$(bash check-protection.sh "$tmp/p.json" "$tmp/r.json" 2>&1); code=$?
  if [ "$code" = "$2" ] && grep -q -- "$3" <<<"$out"; then echo "ok   $1"
  else echo "FAIL $1 (exit $code, want $2; out: $out)"; fail=1; fi
}

OK_P=$(prot '["ci","pr-check","codex-reviewed"]' false 1 true true true)
OK_R=$(repo true false false)

check "matches" 0 "일치" "$OK_P" "$OK_R"
check "context order does not matter" 0 "일치" "$(prot '["codex-reviewed","ci","pr-check"]' false 1 true true true)" "$OK_R"
check "missing codex-reviewed" 1 "required_checks" "$(prot '["ci","pr-check"]' false 1 true true true)" "$OK_R"
check "extra check" 1 "required_checks" "$(prot '["ci","pr-check","codex-reviewed","x"]' false 1 true true true)" "$OK_R"
check "strict on" 1 "strict" "$(prot '["ci","pr-check","codex-reviewed"]' true 1 true true true)" "$OK_R"
check "zero approvals" 1 "approvals" "$(prot '["ci","pr-check","codex-reviewed"]' false 0 true true true)" "$OK_R"
check "stale not dismissed" 1 "dismiss_stale_reviews" "$(prot '["ci","pr-check","codex-reviewed"]' false 1 false true true)" "$OK_R"
check "no last push approval" 1 "require_last_push_approval" "$(prot '["ci","pr-check","codex-reviewed"]' false 1 true false true)" "$OK_R"
check "admins not enforced" 1 "enforce_admins" "$(prot '["ci","pr-check","codex-reviewed"]' false 1 true true false)" "$OK_R"
check "merge commit allowed" 1 "allow_merge_commit" "$OK_P" "$(repo true true false)"
check "rebase allowed, squash off" 1 "allow_squash_merge" "$OK_P" "$(repo false false true)"
check "no reviews block" 1 "approvals" '{"required_status_checks":{"contexts":["ci","pr-check","codex-reviewed"],"strict":false},"enforce_admins":{"enabled":true}}' "$OK_R"

# 403 from gh: stub gh on PATH, real (non-fixture) mode.
mkdir "$tmp/bin"
cat >"$tmp/bin/gh" <<'STUB'
#!/usr/bin/env bash
echo '{"message":"Resource not accessible by personal access token","status":"403"}'
echo "gh: Resource not accessible by personal access token (HTTP 403)" >&2
exit 1
STUB
chmod +x "$tmp/bin/gh"
out=$(PATH="$tmp/bin:$PATH" bash check-protection.sh 2>&1); code=$?
if [ "$code" = 2 ] && grep -q "읽기 권한 없음" <<<"$out"; then echo "ok   403 exits 2"; else echo "FAIL 403 (exit $code: $out)"; fail=1; fi

exit "$fail"
