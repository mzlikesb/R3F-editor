#!/usr/bin/env bash
# SessionStart summary: open PRs (number, title, stage, draft) and this checkout's worktrees.
# Kept under one screen. A network failure collapses the PR part to one line.
# Source this file to use the format functions without running main.

# pr_summary <gh pr list json>: one line per PR, at most 12. Titles of PRs whose author is
# outside the trust list (AGENTS.md "외부 입력") are never shown, only their existence.
pr_summary() {
  jq -r --argjson trusted '["mzlikesb","chillingdaisy-worker1","chatgpt-codex-connector[bot]","github-actions[bot]","app/github-actions","app/chatgpt-codex-connector"]' 'if length == 0 then "열린 PR 없음" else
      (.[0:12] | .[] | if ((.author.login // "") as $a | $trusted | index($a)) then "#\(.number) [\((.labels // [] | map(.name | select(startswith("stage:")) | sub("^stage:"; "")) | first) // "-")]\(if .isDraft then " draft" else "" end) \(.title | .[0:60])" else "외부 작성자 PR #\(.number)" end),
      (if length > 12 then "… 외 \(length - 12)건" else empty end) end' <<<"$1" 2>/dev/null || echo "PR 목록을 읽지 못했다"
}

# worktree_summary: "<dir name> → <branch>" per worktree from `git worktree list --porcelain` on stdin.
worktree_summary() {
  awk '/^worktree /{p=$2; n=p; sub(".*/","",n)} /^branch /{b=$2; sub("refs/heads/","",b); print n " → " b} /^detached/{print n " → (detached)"}'
}

main() {
  local prs
  echo "진행 중인 PR"
  if prs=$(gh pr list --state open --json number,title,isDraft,labels,author --limit 50 2>/dev/null) && [ -n "$prs" ]; then
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
  exit 0
fi
