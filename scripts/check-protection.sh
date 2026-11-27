#!/usr/bin/env bash
# Compares main's real branch protection and merge settings with what AGENTS.md
# "승인과 머지" claims. Prints the differences and exits 1 on any mismatch.
# Exit 2 when the protection read is forbidden (agent-account token).
# Usage: check-protection.sh                      (reads GitHub with gh)
#        check-protection.sh <protection.json> <repo.json>   (fixtures, no network)
# Expected values below mirror the AGENTS.md bullet "브랜치 보호(main)". Change both together.
set -uo pipefail

REPO=mzlikesb/outpost

if [ $# -eq 2 ]; then
  prot=$(cat "$1") || exit 2
  repo=$(cat "$2") || exit 2
else
  err=$(mktemp); trap 'rm -f "$err"' EXIT
  if ! prot=$(gh api "repos/$REPO/branches/main/protection" 2>"$err"); then
    # gh prints the error body on stdout and a summary on stderr; look at both.
    if grep -qi 'Branch not protected' <<<"$prot"$'\n'"$(cat "$err")"; then
      echo "차이 branch_protection: AGENTS.md=보호 켜짐 실제=보호 없음(Branch not protected)"
      exit 1
    fi
    if grep -qE '403|404|Resource not accessible|Not Found' "$err"; then
      echo "읽기 권한 없음 — 사용자 계정으로 실행 (사용자 터미널에서 scripts/check-protection.sh)"
      exit 2
    fi
    cat "$err" >&2; exit 2
  fi
  repo=$(gh api "repos/$REPO" --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge}') || exit 2
fi

# Normalized actual values, one "name=value" per line.
actual=$(jq -r --argjson repo "$repo" '
  "required_checks=" + ((.required_status_checks.contexts // []) | sort | join(",")),
  "strict=" + ((.required_status_checks.strict // false) | tostring),
  "approvals=" + ((.required_pull_request_reviews.required_approving_review_count // 0) | tostring),
  "dismiss_stale_reviews=" + ((.required_pull_request_reviews.dismiss_stale_reviews // false) | tostring),
  "require_last_push_approval=" + ((.required_pull_request_reviews.require_last_push_approval // false) | tostring),
  "enforce_admins=" + ((.enforce_admins.enabled // false) | tostring),
  "allow_squash_merge=" + (($repo.allow_squash_merge // false) | tostring),
  "allow_merge_commit=" + (($repo.allow_merge_commit // false) | tostring),
  "allow_rebase_merge=" + (($repo.allow_rebase_merge // false) | tostring)
' <<<"$prot") || { echo "protection JSON을 읽지 못했다" >&2; exit 2; }

expected='required_checks=actionlint,ci,codex-reviewed,pr-check
strict=false
approvals=1
dismiss_stale_reviews=true
require_last_push_approval=true
enforce_admins=true
allow_squash_merge=true
allow_merge_commit=false
allow_rebase_merge=false'

fail=0
while IFS= read -r line; do
  key=${line%%=*}; want=${line#*=}
  got=$(grep -m1 "^$key=" <<<"$actual" | cut -d= -f2-)
  if [ "$got" != "$want" ]; then
    echo "차이 $key: AGENTS.md=$want 실제=${got:-없음}"
    fail=1
  fi
done <<<"$expected"

if [ "$fail" -eq 0 ]; then echo "브랜치 보호가 AGENTS.md와 일치한다"; fi
exit "$fail"
