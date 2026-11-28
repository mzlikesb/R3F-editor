#!/usr/bin/env bash
# Checks neon-review.sh with fake agy and gh: it reviews the PR head's plan (not the checkout),
# labels the comment with the PR head SHA, and neutralizes mentions.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got [$2] want [$3]"; fail=1; fi; }
repo="$tmp/repo"
mkdir -p "$repo/.claude/prompts" "$repo/scripts" "$repo/docs/plans" "$tmp/bin" "$tmp/log"
cp "$root/.claude/prompts/neon-plan-review.md" "$repo/.claude/prompts/"
cp "$root/scripts/neon-review.sh" "$root/scripts/neon-lib.sh" "$repo/scripts/"
g() { git -C "$repo" -c user.email=a@b -c user.name=t "$@"; }
g init -q
echo "PLAN-AT-HEAD" >"$repo/docs/plans/p.md"
g add -A && g commit -q -m head
head=$(g rev-parse HEAD)
echo "CHECKOUT-DIFFERS" >"$repo/docs/plans/p.md"
g commit -qam later
cat >"$tmp/bin/gh" <<STUB
#!/usr/bin/env bash
case "\$1 \$2" in
  "repo view") echo o/r ;;
  "pr view") echo "$head" ;;
  "api user") echo chillingdaisy-worker1 ;;
  "pr comment") while [ \$# -gt 0 ]; do [ "\$1" = --body ] && printf '%s' "\$2" >"\$FAKE_LOG/body"; shift; done ;;
esac
STUB
cat >"$tmp/bin/agy" <<'STUB'
#!/usr/bin/env bash
printf '%s' "$2" >"$FAKE_LOG/prompt"
echo "ok @codex review"
STUB
chmod +x "$tmp/bin/gh" "$tmp/bin/agy"
run() { (cd "$repo" && env PATH="$tmp/bin:$PATH" FAKE_LOG="$tmp/log" scripts/neon-review.sh 5 "$1" >"$tmp/log/out" 2>&1); }

run docs/plans/p.md
check "exit 0" "$?" 0
grep -q 'PLAN-AT-HEAD' "$tmp/log/prompt" && ! grep -q 'CHECKOUT-DIFFERS' "$tmp/log/prompt"
check "prompt uses the PR head plan" "$?" 0
check "header uses PR head sha" "$(head -1 "$tmp/log/body")" "## neon review · \`${head:0:7}\`"
grep -q $'@\xe2\x80\x8dcodex' "$tmp/log/body"
check "mention neutralized" "$?" 0

rm -f "$tmp/log/body"
run docs/plans/missing.md
check "missing plan at head fails" "$?" 1
[ ! -e "$tmp/log/body" ]
check "missing plan posts nothing" "$?" 0
exit $fail
