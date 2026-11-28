#!/usr/bin/env bash
# Checks snapshot-critique.sh: it shoots only when the Preview comment's deployed SHA matches,
# waits otherwise (time out = fail, nothing shot), and rejects a URL that differs from the comment.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
check() {
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got [$2] want [$3]"; fail=1; fi
}
repo="$tmp/repo"
mkdir -p "$repo/scripts" "$tmp/bin" "$tmp/log"
cp "$root/scripts/snapshot-critique.sh" "$repo/scripts/"
cat >"$repo/scripts/neon-art-critique.sh" <<'STUB'
#!/usr/bin/env bash
echo "$@" >"$FAKE_LOG/critique"
STUB
chmod +x "$repo/scripts/neon-art-critique.sh"
# The script runs `node scripts/snapshot.mjs <url> <sha>`; a fake node records the arguments.
cat >"$tmp/bin/node" <<'STUB'
#!/usr/bin/env bash
shift
echo "$@" >>"$FAKE_LOG/shot"
echo /res/dir
STUB
cat >"$tmp/bin/gh" <<'STUB'
#!/usr/bin/env bash
case "$1 $2" in
  "repo view") echo o/r ;;
  "pr view") echo "${FAKE_HEAD:-abc1234def5678}" ;;
  "api repos/o/r/issues/7/comments") cat "$FAKE_LOG/comments.json" ;;
esac
STUB
chmod +x "$tmp/bin/node" "$tmp/bin/gh"
git -C "$repo" init -q
git -C "$repo" -c user.email=a@b -c user.name=t commit -q --allow-empty -m init

comments() { # comments <sha7> [login]
  jq -n --arg s "$1" --arg l "${2:-github-actions[bot]}" '[
    {user:{login:"someone"}, body:"hi"},
    {user:{login:$l}, body:("<!-- preview-url -->\n**Preview:** https://pr-7-outpost.me.workers.dev\n대상 커밋: `" + $s + "`")}]' >"$tmp/log/comments.json"
}
run() { # run <args...>; env FAKE_* inherited from caller via env
  rm -f "$tmp/log/shot" "$tmp/log/critique"
  (cd "$repo" && env PATH="$tmp/bin:$PATH" FAKE_LOG="$tmp/log" SNAPSHOT_WAIT_INTERVAL=1 SNAPSHOT_WAIT_MAX=2 \
    scripts/snapshot-critique.sh "$@" >"$tmp/log/out" 2>&1)
}

comments abc1234
run 7
check "match: exit 0" "$?" 0
check "match: shoots comment URL with head sha" "$(cat "$tmp/log/shot")" "https://pr-7-outpost.me.workers.dev abc1234def5678"
check "match: critique gets pr res sha" "$(cat "$tmp/log/critique")" "7 /res/dir abc1234def5678"

run 7 https://pr-7-outpost.me.workers.dev/
check "same URL arg: ok" "$?" 0

comments 1111111
run 7
check "mismatch: times out nonzero" "$?" 1
[ ! -e "$tmp/log/shot" ] && [ ! -e "$tmp/log/critique" ]
check "mismatch: nothing shot or posted" "$?" 0
grep -q '1111111' "$tmp/log/out" && grep -q 'abc1234' "$tmp/log/out"
check "mismatch: says why" "$?" 0

comments abc1234
run 7 https://outpost.me.workers.dev
check "URL arg differs: fails" "$?" 1
[ ! -e "$tmp/log/shot" ]
check "URL arg differs: nothing shot" "$?" 0

run 7 "" ABC1234FFFF
check "explicit sha, case-insensitive: ok" "$?" 0

comments abc1234 someone-else
run 7
check "comment from non-bot ignored" "$?" 1

echo '[]' >"$tmp/log/comments.json"
run 7
check "no comment: fails" "$?" 1
exit $fail
