#!/usr/bin/env bash
# Art critique for small PRs that touch src/scene, src/ui or src/index.css: no persona, just
# phone and pc screenshots of the PR's Preview, then scripts/neon-art-critique.sh posts the critique.
# Usage: scripts/snapshot-critique.sh <pr-number> <preview-url> [sha]
# sha defaults to the PR head (the Preview must have deployed it). Production URLs are rejected.
set -euo pipefail
pr=${1:?usage: scripts/snapshot-critique.sh <pr-number> <preview-url> [sha]}
url=${2:?usage: scripts/snapshot-critique.sh <pr-number> <preview-url> [sha]}
sha=${3:-}
cd "$(git rev-parse --show-toplevel)"
[ -n "$sha" ] || sha=$(gh pr view "$pr" --json headRefOid -q .headRefOid)

out=$(node scripts/snapshot.mjs "$url" "$sha")
resdir=$(tail -n 1 <<<"$out")
echo "snapshot: $resdir"
exec scripts/neon-art-critique.sh "$pr" "$resdir" "$sha"
