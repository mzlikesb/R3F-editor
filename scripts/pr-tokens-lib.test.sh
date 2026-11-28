#!/usr/bin/env bash
# Checks pr_tokens_project_dirs: path-derived globs, and the PR_TOKENS_DIRS override.
set -uo pipefail
cd "$(dirname "$0")"
. ./pr-tokens-lib.sh
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got [$2] want [$3]"; fail=1; fi; }
got=$(PR_TOKENS_DIRS= pr_tokens_project_dirs /r /Users/a.b/projects/money/working outpost | tr '\n' ' ')
check "derived from checkout path" "$got" "/r/-Users-a-b-projects-money-working* /r/-Users-a-b-projects-money-outpost-* "
got=$(PR_TOKENS_DIRS='/x/* /y/*' pr_tokens_project_dirs /r /m n | tr '\n' ' ')
check "env override" "$got" "/x/* /y/* "
exit $fail
