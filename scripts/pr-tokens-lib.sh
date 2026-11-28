#!/usr/bin/env bash
# Helper for scripts/pr-tokens.sh (sourced; unit-tested).

# pr_tokens_project_dirs <projects-root> <main-checkout> <repo-name>
# Prints the glob patterns of Claude Code session folders for this repo: the main checkout
# (-<path with non-alphanumerics as dashes>*) and sibling worktrees (<parent>-<repo>-*).
# PR_TOKENS_DIRS (space-separated globs) overrides it.
pr_tokens_project_dirs() {
  if [ -n "${PR_TOKENS_DIRS:-}" ]; then
    printf '%s\n' $PR_TOKENS_DIRS
    return
  fi
  local root=$1 main=$2 name=$3 enc parent
  enc=$(printf '%s' "$main" | tr -c 'A-Za-z0-9\n' '-')
  parent=$(printf '%s' "$(dirname "$main")" | tr -c 'A-Za-z0-9\n' '-')
  printf '%s\n' "$root/${enc}*" "$root/${parent}-${name}-*"
}
