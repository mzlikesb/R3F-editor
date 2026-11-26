#!/usr/bin/env bash
# Notification/Stop hook: show a herdr notification if herdr is available. Never fails the session.
kind=${1:-done}
input=$(cat)
command -v herdr >/dev/null 2>&1 || exit 0
if [ "$kind" = request ]; then
  msg=$(jq -r '.message // "사용자 확인이 필요합니다"' <<<"$input" 2>/dev/null)
  herdr notification show "OUTPOST · 확인 필요" --body "$msg" --sound request >/dev/null 2>&1 || true
else
  herdr notification show "OUTPOST · 턴 종료" --body "$(basename "$PWD")" --sound done >/dev/null 2>&1 || true
fi
exit 0
