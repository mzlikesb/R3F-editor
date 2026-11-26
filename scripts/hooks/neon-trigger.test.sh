#!/usr/bin/env bash
# Dry-run checks for neon-trigger.sh against a throwaway repo and a stubbed `gh`.
# Does not post anything and does not depend on the current branch.
set -uo pipefail
hook="$(cd "$(dirname "$0")" && pwd -P)/neon-trigger.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

# Throwaway repo: origin/main at the base commit, a feature branch that changes a plan.
repo="$tmp/repo"
git init -q -b main "$repo"
git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m base
git -C "$repo" update-ref refs/remotes/origin/main HEAD
git -C "$repo" switch -q -c feat/x
mkdir -p "$repo/docs/plans"
echo "# plan" >"$repo/docs/plans/003-x.md"
echo "# tasks" >"$repo/docs/plans/003-x-tasks.md"
git -C "$repo" add docs && git -C "$repo" -c user.email=t@t -c user.name=t commit -q -m plan

stub="$tmp/bin"
mkdir -p "$stub"
stub_gh() { # stub_gh <labels-json-array>
  cat >"$stub/gh" <<EOF
#!/usr/bin/env bash
[ "\$1 \$2" = "pr view" ] && echo '{"number":99,"state":"OPEN","labels":$(jq -c 'map({name:.})' <<<"$1")}' && exit 0
exit 1
EOF
  chmod +x "$stub/gh"
}

expect() { # expect <cwd> <substring-or-empty> <command>
  local d=$1 want=$2 cmd=$3 out
  out=$(jq -n --arg c "$cmd" --arg d "$d" '{tool_input:{command:$c},cwd:$d}' |
    PATH="$stub:$PATH" NEON_TRIGGER_DRY_RUN=1 "$hook" 2>&1)
  if { [ -n "$want" ] && grep -qF "$want" <<<"$out"; } || { [ -z "$want" ] && [ -z "$out" ]; }; then
    echo "ok   ($d) $cmd → ${out:-(nothing)}"
  else
    echo "FAIL ($d) $cmd → ${out:-(nothing)} (want: ${want:-nothing})"
    fail=1
  fi
}

stub_gh '["size:large","stage:plan-review"]'
expect "$repo" "" "git status"
expect "$repo" "would review PR #99 with docs/plans/003-x.md" "git push -q"
expect "$repo" "would review PR #99 with docs/plans/003-x.md" "gh pr create --draft --title x"
# Leading environment assignments do not hide the command.
expect "$repo" "would review PR #99 with docs/plans/003-x.md" "FOO=bar gh pr create --draft --title x"
# Run from elsewhere: the hook follows `cd` / `git -C` into the repo.
expect /tmp "would review PR #99" "cd $repo && git push -q"
expect /tmp "would review PR #99" "git -C $repo push -q"

stub_gh '["size:large","stage:code-review"]'
expect "$repo" "not in stage:plan-review" "git push -q"

# Already reviewed: the state file holds HEAD.
stub_gh '["size:large","stage:plan-review"]'
mkdir -p "$repo/.git/neon"
git -C "$repo" rev-parse HEAD >"$repo/.git/neon/feat_x"
expect "$repo" "already reviewed" "git push -q"

exit $fail
