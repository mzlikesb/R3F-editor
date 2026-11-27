#!/usr/bin/env bash
# Runs every *.test.sh (bash) and *.test.mjs (node --test) under a root folder
# (default: this scripts/ folder), skipping node_modules and testdata.
# Name order, deterministic. Exits non-zero if any file fails. Usage: run-tests.sh [root]
set -uo pipefail
root="${1:-$(cd "$(dirname "$0")" && pwd)}"

files=$(LC_ALL=C find "$root" \( -name node_modules -o -name testdata \) -prune -o \
  -type f \( -name '*.test.sh' -o -name '*.test.mjs' \) -print | LC_ALL=C sort)

summary=""
failed=0
total=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  total=$((total + 1))
  echo "=== $f"
  case "$f" in
    *.test.sh) bash "$f" ;;
    *) node --test "$f" ;;
  esac
  if [ $? -eq 0 ]; then
    summary="${summary}ok   ${f}"$'\n'
  else
    summary="${summary}FAIL ${f}"$'\n'
    failed=$((failed + 1))
  fi
done <<<"$files"

echo
echo "--- test summary ($total files, $failed failed)"
printf '%s' "$summary"
[ "$failed" -eq 0 ]
