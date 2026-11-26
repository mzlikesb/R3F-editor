#!/usr/bin/env bash
# Checks the status line and session summary formatting with fake input (no network, no checkout state).
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
source ./statusline.sh
source ./session-summary.sh
fail=0
check() { # check <name> <want> <got>
  if [ "$3" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1"; echo " got  $3"; echo " want $2"; fail=1; fi
}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

printf 'github.com:\n    users:\n        chillingdaisy-worker1:\n    user: chillingdaisy-worker1\n' >"$tmp/hosts.yml"
check "gh_account" "chillingdaisy-worker1" "$(gh_account "$tmp/hosts.yml")"
check "gh_account missing file" "" "$(gh_account "$tmp/none.yml")"
check "label agent" "agent" "$(account_label chillingdaisy-worker1)"
check "label user" "mzlikesb" "$(account_label mzlikesb)"
check "label unknown" "?" "$(account_label "")"

check "pr_label stage" "#12 code-review" "$(pr_label '[{"number":12,"labels":[{"name":"size:small"},{"name":"stage:code-review"}]}]')"
check "pr_label no stage" "#7" "$(pr_label '[{"number":7,"labels":[{"name":"quality"}]}]')"
check "pr_label none" "PR 없음" "$(pr_label '[]')"
check "pr_label garbage" "PR ?" "$(pr_label 'not json')"
check "status_line" "chore/x · agent · #12 dev" "$(status_line chore/x agent '#12 dev')"

prs='[{"number":3,"title":"feat: a","isDraft":true,"labels":[{"name":"stage:plan-review"}]},{"number":4,"title":"fix: b","isDraft":false,"labels":[]}]'
check "pr_summary" $'#3 [plan-review] draft feat: a\n#4 [-] fix: b' "$(pr_summary "$prs")"
check "pr_summary empty" "열린 PR 없음" "$(pr_summary '[]')"
check "pr_summary garbage" "PR 목록을 읽지 못했다" "$(pr_summary 'xx')"
check "worktree_summary" $'working → main\noutpost-x → chore/x' "$(printf 'worktree /a/working\nHEAD 1\nbranch refs/heads/main\n\nworktree /a/outpost-x\nHEAD 2\nbranch refs/heads/chore/x\n' | worktree_summary)"

# End to end with a stub gh: the second call must hit the cache.
mkdir "$tmp/bin"
printf '#!/usr/bin/env bash\necho x >>"%s/calls"\necho '"'"'[{"number":5,"labels":[{"name":"stage:qa"}]}]'"'"'\n' "$tmp" >"$tmp/bin/gh"
chmod +x "$tmp/bin/gh"
git init -q -b feat/t "$tmp/repo"
out1=$(PATH="$tmp/bin:$PATH" TMPDIR="$tmp" GH_CONFIG_DIR="$tmp" bash ./statusline.sh <<<"{\"workspace\":{\"current_dir\":\"$tmp/repo\"}}")
out2=$(PATH="$tmp/bin:$PATH" TMPDIR="$tmp" GH_CONFIG_DIR="$tmp" bash ./statusline.sh <<<"{\"cwd\":\"$tmp/repo\"}")
check "main output" "feat/t · agent · #5 qa" "$out1"
check "cached output" "feat/t · agent · #5 qa" "$out2"
check "gh called once" "1" "$(wc -l <"$tmp/calls" | tr -d ' ')"
check "bad stdin" "(브랜치 없음)" "$(cd "$tmp" && PATH="$tmp/bin:$PATH" TMPDIR="$tmp" GH_CONFIG_DIR="$tmp" bash "$here/statusline.sh" <<<"garbage")"
exit $fail
