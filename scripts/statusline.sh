#!/usr/bin/env bash
# Claude Code status line: <branch> · <gh account> · #<PR> <stage>.
# Reads the status JSON on stdin (workspace.current_dir / cwd). The PR lookup is a network
# call, so it is cached for 60s under $TMPDIR. Any failure prints a short line, never an error.
# Source this file to use the format functions without running main.

# gh_account <hosts.yml path>: login stored in the gh config, empty if unknown (no network).
gh_account() {
  [ -f "$1" ] || return 0
  sed -n -E 's/^[[:space:]]+user:[[:space:]]+([^[:space:]]+)[[:space:]]*$/\1/p' "$1" | head -1
}

# account_label <login>: "agent" for the agent account, the login otherwise, "?" if unknown.
account_label() {
  local agent=${AGENT_LOGIN:-chillingdaisy-worker1}
  if [ -z "$1" ]; then echo "?"; elif [ "$1" = "$agent" ]; then echo "agent"; else echo "$1"; fi
}

# pr_label <gh pr list json>: "#N stage" (or "#N" without a stage label, "PR 없음" for none).
pr_label() {
  jq -r 'if (type == "array" and length > 0) then
      .[0] | "#\(.number)" + ((.labels // [] | map(.name | select(startswith("stage:")) | sub("^stage:"; "")) | first) as $s | if $s then " \($s)" else "" end)
    else "PR 없음" end' <<<"$1" 2>/dev/null || echo "PR ?"
}

# status_line <branch> <account label> <pr label>
status_line() { printf '%s · %s · %s' "$1" "$2" "$3"; }

# cached_prs <dir> <branch> [ttl]: gh pr list JSON for the branch, cached per dir+branch.
cached_prs() {
  local dir=$1 branch=$2 ttl=${3:-60} key f now mtime out
  key=$(printf '%s\n%s' "$dir" "$branch" | cksum | cut -d' ' -f1)
  f="${TMPDIR:-/tmp}/outpost-statusline-${key}.json"
  now=$(date +%s)
  mtime=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo 0)
  if [ -f "$f" ] && [ $((now - mtime)) -lt "$ttl" ]; then cat "$f"; return; fi
  out=$(cd "$dir" 2>/dev/null && gh pr list --head "$branch" --state open --json number,labels --limit 1 2>/dev/null) || out=""
  [ -n "$out" ] || out="[]"
  printf '%s' "$out" >"$f" 2>/dev/null
  printf '%s' "$out"
}

main() {
  local input dir branch acct prs
  input=$(cat 2>/dev/null || true)
  dir=$(jq -r '.workspace.current_dir // .cwd // empty' <<<"$input" 2>/dev/null)
  [ -n "$dir" ] || dir=$PWD
  branch=$(git -C "$dir" branch --show-current 2>/dev/null)
  if [ -z "$branch" ]; then echo "(브랜치 없음)"; return 0; fi
  acct=$(account_label "$(gh_account "${GH_CONFIG_DIR:+$GH_CONFIG_DIR/hosts.yml}")")
  if [ "$branch" = main ]; then status_line "$branch" "$acct" "-"; return 0; fi
  prs=$(cached_prs "$dir" "$branch")
  status_line "$branch" "$acct" "$(pr_label "$prs")"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main 2>/dev/null || echo "outpost"; fi
