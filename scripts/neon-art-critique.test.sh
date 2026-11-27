#!/usr/bin/env bash
# Checks neon-lib.sh helpers and neon-art-critique.sh end to end with a fake agy and gh.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
check() { # check <name> <got> <want>
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got [$2] want [$3]"; fail=1; fi
}
# shellcheck source=scripts/neon-lib.sh
. "$root/scripts/neon-lib.sh"

# Screenshot selection: p1 has 5 shots, p2 has 2, p3 has 1, p4 has none.
res="$tmp/res"
mkdir -p "$res/p1" "$res/p2" "$res/p3" "$res/p4"
for i in 1 2 3 4 5; do : >"$res/p1/page-$i.png"; done
: >"$res/p2/page-a.png"
: >"$res/p2/page-b.png"
: >"$res/p3/page-z.png"
: >"$res/p1/report.md"
got=$(neon_pick_screenshots "$res" 3 9 | sed "s#$res/##" | tr '\n' ' ')
check "pick: first, last, middle per persona" "$got" "p1/page-1.png p2/page-a.png p3/page-z.png p1/page-5.png p2/page-b.png p1/page-3.png "
got=$(neon_pick_screenshots "$res" 3 2 | wc -l | tr -d ' ')
check "pick: total cap" "$got" 2
got=$(neon_pick_screenshots "$tmp/none" 3 9 | wc -l | tr -d ' ')
check "pick: empty" "$got" 0

zwj=$'\xe2\x80\x8d'
got=$(printf '@codex review' | neon_neutralize_mentions)
check "mentions neutralized" "$got" "@${zwj}codex review"
got=$(printf '%s/x/a.png' "$HOME" | neon_shorten_home)
check "home shortened" "$got" '~/x/a.png'

# End to end with fakes, in a scratch git repo that has the prompt file.
repo="$tmp/repo"
mkdir -p "$repo/.claude/prompts" "$repo/scripts" "$tmp/bin" "$tmp/log"
cp "$root/.claude/prompts/neon-art-critique.md" "$repo/.claude/prompts/"
cp "$root/scripts/neon-art-critique.sh" "$root/scripts/neon-lib.sh" "$repo/scripts/"
git -C "$repo" init -q
git -C "$repo" -c user.email=a@b -c user.name=t commit -q --allow-empty -m init
cat >"$tmp/bin/gh" <<'STUB'
#!/usr/bin/env bash
case "$1 $2" in
  "repo view") echo o/r ;;
  "api user") echo "${FAKE_GH_USER:-chillingdaisy-worker1}" ;;
  "pr comment") while [ $# -gt 0 ]; do [ "$1" = --body ] && printf '%s' "$2" >"$FAKE_LOG/body"; shift; done ;;
esac
STUB
cat >"$tmp/bin/agy" <<'STUB'
#!/usr/bin/env bash
printf '%s' "$2" >"$FAKE_LOG/prompt"
if [ "${FAKE_AGY_FAIL:-}" = 1 ]; then echo "quota exceeded"; exit 1; fi
echo "## 판정"
echo "수정 요청 @codex review ($HOME/x/page-1.png)"
STUB
chmod +x "$tmp/bin/gh" "$tmp/bin/agy"
run() { (cd "$repo" && env PATH="$tmp/bin:$PATH" FAKE_LOG="$tmp/log" "$@" scripts/neon-art-critique.sh 7 "$res" ${RUN_SHA_ARG:-} >"$tmp/log/out" 2>&1); }

# No run.json and no argument: fails, posts nothing (never falls back to HEAD).
rm -f "$tmp/log/body"
run env
[ ! -e "$tmp/log/body" ]
check "no tested sha: fails without posting" "$?" 0
grep -q 'SHA' "$tmp/log/out"
check "no tested sha: says why" "$?" 0

# Explicit argument.
rm -f "$tmp/log/body"
RUN_SHA_ARG=abc1234 run env
head1=$(head -1 "$tmp/log/body")
check "header uses explicit sha and folder name" "$head1" '## neon art critique · `abc1234` · `res`'

# run.json wins over the argument.
printf '{"url":"u","sha":"def5678"}\n' >"$res/run.json"
rm -f "$tmp/log/body"
RUN_SHA_ARG=abc1234 run env
head1=$(head -1 "$tmp/log/body")
check "run.json sha wins" "$head1" '## neon art critique · `def5678` · `res`'

rm -f "$tmp/log/body"
run env
head1=$(head -1 "$tmp/log/body")
check "header from run.json" "$head1" '## neon art critique · `def5678` · `res`'
grep -q "@$zwj" "$tmp/log/body" && ! grep -q '@codex' "$tmp/log/body"
check "body mention neutral" "$?" 0
grep -qF "$HOME" "$tmp/log/body"
check "body has no home path" "$?" 1
grep -qF "$res/p1/page-1.png" "$tmp/log/prompt"
check "prompt lists screenshot paths" "$?" 0

rm -f "$tmp/log/body"
run env FAKE_AGY_FAIL=1
head1=$(head -1 "$tmp/log/body")
case "$head1" in *'· skipped') echo "ok   skipped header" ;; *) echo "FAIL skipped header [$head1]"; fail=1 ;; esac
grep -q 'quota exceeded' "$tmp/log/body"
check "skipped reason" "$?" 0

rm -f "$tmp/log/body"
run env FAKE_GH_USER=someone
[ ! -e "$tmp/log/body" ]
check "wrong gh account posts nothing" "$?" 0
exit $fail
