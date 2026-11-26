#!/usr/bin/env bash
# SessionStart summary: open PRs (number, title, stage, draft) and this checkout's worktrees.
# Kept under one screen. A network failure collapses the PR part to one line.
# Source this file to use the format functions without running main.

# pr_summary <gh pr list json>: one line per PR, at most 12.
pr_summary() {
  jq -r 'if length == 0 then "열린 PR 없음" else
      (.[0:12] | .[] | "#\(.number) [\((.labels // [] | map(.name | select(startswith("stage:")) | sub("^stage:"; "")) | first) // "-")]\(if .isDraft then " draft" else "" end) \(.title | .[0:60])"),
      (if length > 12 then "… 외 \(length - 12)건" else empty end) end' <<<"$1" 2>/dev/null || echo "PR 목록을 읽지 못했다"
}

# worktree_summary: "<dir name> → <branch>" per worktree from `git worktree list --porcelain` on stdin.
worktree_summary() {
  awk '/^worktree /{p=$2; n=p; sub(".*/","",n)} /^branch /{b=$2; sub("refs/heads/","",b); print n " → " b} /^detached/{print n " → (detached)"}'
}

main() {
  local prs
  echo "진행 중인 PR"
  if prs=$(gh pr list --state open --json number,title,isDraft,labels --limit 50 2>/dev/null) && [ -n "$prs" ]; then
    pr_summary "$prs"
  else
    echo "PR 목록을 가져오지 못했다(네트워크·gh 확인)"
  fi
  echo "worktree"
  git worktree list --porcelain 2>/dev/null | worktree_summary | head -10
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null
  main 2>/dev/null || echo "세션 요약을 만들지 못했다"
fi
exit 0
