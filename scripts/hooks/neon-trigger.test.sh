#!/usr/bin/env bash
# Dry-run checks for neon-trigger.sh with a stubbed `gh`. Does not post anything.
set -uo pipefail
cd "$(dirname "$0")/../.."
hook=scripts/hooks/neon-trigger.sh
stub=$(mktemp -d)
trap 'rm -rf "$stub"' EXIT
fail=0

stub_gh() { # stub_gh <labels-json-array>
  cat >"$stub/gh" <<EOF
#!/usr/bin/env bash
[ "\$1 \$2" = "pr view" ] && echo '{"number":99,"state":"OPEN","labels":$(jq -c 'map({name:.})' <<<"$1")}' && exit 0
exit 1
EOF
  chmod +x "$stub/gh"
}

expect() { # expect <substring> <command>
  local want=$1 cmd=$2 out
  out=$(jq -n --arg c "$cmd" --arg d "$PWD" '{tool_input:{command:$c},cwd:$d}' |
    PATH="$stub:$PATH" NEON_TRIGGER_DRY_RUN=1 "$hook" 2>&1)
  if grep -qF "$want" <<<"$out" || { [ -z "$want" ] && [ -z "$out" ]; }; then
    echo "ok   $cmd → ${out:-(nothing)}"
  else
    echo "FAIL $cmd → ${out:-(nothing)} (want: ${want:-nothing})"
    fail=1
  fi
}

# Run on a branch with a plan change vs origin/main (true for harness PRs).
state="$(git rev-parse --git-common-dir)/neon/$(git symbolic-ref --short HEAD | tr / _)"
saved=$(cat "$state" 2>/dev/null || true)
rm -f "$state"

stub_gh '["size:large","stage:plan-review"]'
expect "" "git status"
expect "would review PR #99 with docs/plans/" "git push -q"
expect "would review PR #99 with docs/plans/" "gh pr create --draft --title x"

stub_gh '["size:large","stage:code-review"]'
expect "not in stage:plan-review" "git push -q"

[ -n "$saved" ] && echo "$saved" >"$state"
exit $fail
