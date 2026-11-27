#!/usr/bin/env bash
# Runs the neon (Antigravity CLI) art/UX critique on playtest screenshots and posts it to the
# PR as the agent account. agy has no image flag: it opens image files named by path in the
# prompt, so the selected screenshots are listed by absolute path.
# Usage: scripts/neon-art-critique.sh <pr-number> <playtest-result-dir>
set -euo pipefail

pr=${1:?usage: scripts/neon-art-critique.sh <pr-number> <result-dir>}
resdir=${2:?usage: scripts/neon-art-critique.sh <pr-number> <result-dir>}
resdir=${resdir/#\~/$HOME}
agent=chillingdaisy-worker1
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
cd "$(git rev-parse --show-toplevel)"
# shellcheck source=scripts/neon-lib.sh
. scripts/neon-lib.sh
sha=$(git rev-parse --short HEAD)

who=$(gh api user -q .login 2>/dev/null || echo "?")
if [ "$who" != "$agent" ]; then
  echo "neon-art-critique: 현재 gh 계정이 '$who'다. '$agent'로 실행한다(GH_CONFIG_DIR=<에이전트 gh 폴더>)" >&2
  exit 1
fi
[ -d "$resdir" ] || { echo "neon-art-critique: 결과 폴더가 없다: $resdir" >&2; exit 1; }

shots=$(neon_pick_screenshots "$resdir" "${NEON_ART_PER_PERSONA:-3}" "${NEON_ART_TOTAL:-9}")
[ -n "$shots" ] || { echo "neon-art-critique: 스크린샷이 없다: $resdir" >&2; exit 1; }
count=$(grep -c . <<<"$shots")

out=$(mktemp)
trap 'rm -f "$out"' EXIT
prompt=$(
  echo '파일 읽기로 아래 스크린샷만 열어 본다. 그 밖의 도구(명령 실행·수정)는 쓰지 않는다.'
  echo
  cat .claude/prompts/neon-art-critique.md
  echo
  echo "--- 리뷰 대상 스크린샷 ${count}장 (플레이테스트 결과, 커밋 $sha) ---"
  while IFS= read -r f; do echo "$f"; done <<<"$shots"
)

if agy -p "$prompt" --mode plan --print-timeout 600s >"$out" 2>&1 && [ -s "$out" ] && ! grep -q '^jetski: no output produced' "$out"; then
  text=$(cat "$out")
  verdict=done
else
  text="사유: $(head -c 300 "$out" | tr '\n' ' ')"
  verdict=skipped
fi

text=$(neon_shorten_home <<<"$text" | neon_neutralize_mentions)
folder=$(neon_shorten_home <<<"$resdir")
names=$(while IFS= read -r f; do printf '`%s` ' "$(basename "$f")"; done <<<"$shots")

if [ "$verdict" = done ]; then
  head_line=$(printf '## neon art critique · `%s`' "$sha")
else
  head_line=$(printf '## neon art critique · `%s` · skipped' "$sha")
fi
body=$(printf '%s\n\n%s\n\n결과 폴더: `%s` · 대상 %s장: %s' "$head_line" "$text" "$folder" "$count" "$names")

gh pr comment "$pr" --repo "$repo" --body "$body" >/dev/null
echo "neon art critique $verdict for $sha (PR #$pr, posted as $agent)"
