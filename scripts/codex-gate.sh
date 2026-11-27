#!/usr/bin/env bash
# Prints the codex-reviewed verdict JSON: codex-gate.sh <head-sha> <comments.json> <reviews.json>
# Pure function of its inputs (no network); the workflow fetches and posts.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
head=$1 comments=$2 reviews=$3
jq -n -c --arg head "$head" --slurpfile c "$comments" --slurpfile r "$reviews" \
  '{head: $head, comments: $c[0], reviews: $r[0]}' | jq -c -f "$here/codex-gate.jq"
