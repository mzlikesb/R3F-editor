#!/usr/bin/env bash
# Art critique for small PRs that touch src/scene, src/ui or src/index.css: no persona, just
# phone and pc screenshots of the PR's Preview, then scripts/neon-art-critique.sh posts the critique.
# Usage: scripts/snapshot-critique.sh <pr-number> [preview-url] [sha]
# The Preview URL and the deployed commit come from the deploy bot's `<!-- preview-url -->` PR comment.
# sha defaults to the PR head. It shoots only when the deployed commit (first 7 chars) equals sha;
# otherwise it polls every SNAPSHOT_WAIT_INTERVAL seconds (default 20) up to SNAPSHOT_WAIT_MAX (default 600)
# and then fails without shooting or posting. A given preview-url must equal the comment's URL.
# Production URLs are rejected (by the comment match and again by snapshot.mjs).
set -euo pipefail
usage='usage: scripts/snapshot-critique.sh <pr-number> [preview-url] [sha]'
pr=${1:?$usage}
url_arg=${2:-}
sha=${3:-}
interval=${SNAPSHOT_WAIT_INTERVAL:-20}
max_wait=${SNAPSHOT_WAIT_MAX:-600}
cd "$(git rev-parse --show-toplevel)"
[ -n "$sha" ] || sha=$(gh pr view "$pr" --json headRefOid -q .headRefOid)
want=$(printf '%s' "${sha:0:7}" | tr 'A-F' 'a-f')
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Prints "<url> <sha7>" of the newest deploy-bot marker comment, or nothing.
read_deploy() {
  gh api "repos/$repo/issues/$pr/comments" --paginate 2>/dev/null | jq -r '
    .[] | select((.user.login // "") == "github-actions[bot]" and (.body | startswith("<!-- preview-url -->")))
    | .body | [ (capture("\\*\\*Preview:\\*\\* (?<u>\\S+)").u // empty), (capture("대상 커밋: `(?<s>[0-9a-fA-F]{7,40})`").s // empty) ]
    | select(length == 2) | "\(.[0]) \(.[1][0:7])"' 2>/dev/null | tail -n 1 || true
}

waited=0
while :; do
  read -r url deployed <<<"$(read_deploy)" || true
  deployed=$(printf '%s' "${deployed:-}" | tr 'A-F' 'a-f')
  if [ -n "${url:-}" ] && [ -n "$url_arg" ] && [ "${url_arg%/}" != "${url%/}" ]; then
    echo "error: given URL ($url_arg) differs from the Preview comment URL ($url)" >&2
    exit 1
  fi
  if [ -n "${url:-}" ] && [ "$deployed" = "$want" ]; then break; fi
  if [ "$waited" -ge "$max_wait" ]; then
    echo "error: Preview deployed ${deployed:-none} but ${want} is needed (waited ${waited}s). Nothing shot or posted." >&2
    exit 1
  fi
  echo "waiting for Preview of ${want} (deployed: ${deployed:-none}, ${waited}s)" >&2
  sleep "$interval"
  waited=$((waited + interval))
done

out=$(node scripts/snapshot.mjs "$url" "$sha")
resdir=$(tail -n 1 <<<"$out")
echo "snapshot: $resdir"
exec scripts/neon-art-critique.sh "$pr" "$resdir" "$sha"
