#!/usr/bin/env bash
# Checks pr-stats.jq counting on a fixed PR fixture (no network).
set -uo pipefail
cd "$(dirname "$0")"
u() { printf '{"user":{"login":"%s"},"body":%s%s}' "$1" "$(jq -Rn --arg b "$2" '$b')" "${3:+,\"state\":\"$3\"}"; }
fixture=$(cat <<EOF
{
  "pr": {"number": 7, "title": "t", "created_at": "2026-11-26T10:00:00Z", "merged_at": "2026-11-26T11:30:59Z"},
  "comments": [
    $(u 'chatgpt-codex-connector[bot]' '<!-- codex-review-receipt:v1 --> no issues'),
    $(u 'chatgpt-codex-connector[bot]' '<!-- codex-pull-request-review-summary -->'),
    $(u 'chatgpt-codex-connector-attacker' '<!-- codex-review-receipt:v1 -->'),
    $(u chillingdaisy-worker1 '## neon review · `abc`
body'),
    $(u chillingdaisy-worker1 '## neon review · `def` · skipped
quota'),
    $(u chillingdaisy-worker1 '반영했습니다. ## neon review'),
    $(u chillingdaisy-worker1 '@codex review'),
    $(u mzlikesb '질문 하나'),
    $(u 'github-actions[bot]' 'Preview')
  ],
  "reviews": [
    $(u 'chatgpt-codex-connector[bot]' '<!-- codex-review-receipt:v1 --> findings' COMMENTED),
    $(u mzlikesb '' COMMENTED),
    $(u mzlikesb '이건 고쳐줘' CHANGES_REQUESTED),
    $(u mzlikesb '👍' APPROVED)
  ],
  "inline": [
    $(u 'chatgpt-codex-connector[bot]' 'P1'),
    $(u 'chatgpt-codex-connector[bot]' 'P2'),
    $(u mzlikesb 'inline'),
    $(u someone-else 'spam')
  ],
  "runs": [{"conclusion":"failure"},{"conclusion":"success"},{"conclusion":"cancelled"},{"conclusion":"failure"}]
}
EOF
)
got=$(jq -c -f pr-stats.jq <<<"$fixture") || { echo "FAIL jq error"; exit 1; }
want='{"number":7,"title":"t","open_to_merge_min":90,"codex_reviews":2,"codex_findings":2,"neon_reviews":1,"neon_skipped":1,"user_comments":3,"approvals":1,"ci_failures":2}'
if [ "$got" = "$want" ]; then echo "ok   pr-stats counts"; else echo "FAIL pr-stats counts"; echo " got  $got"; echo " want $want"; exit 1; fi
