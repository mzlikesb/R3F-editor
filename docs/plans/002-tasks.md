# 002 — 작업 목록

플랜: `docs/plans/002-identity.md`. 작업끼리 파일이 겹치지 않는다.

## 약속
- 에이전트 gh 폴더: `/Users/dongyopark/.config/gh-agent` (`hosts.yml`의 `user: chillingdaisy-worker1`)
- 신뢰 역할: `user`(mzlikesb) · `agent`(chillingdaisy-worker1, 알림 생략) · `neon`(chillingdaisy-worker1, 본문이 `## neon review`로 시작) · `codex`(`chatgpt-codex-connector[bot]`) · `ci`(`github-actions[bot]`) · `untrusted`
- 필수 체크: `ci`, `pr-check`

| # | 작업 | 담당 | 파일 | 완료 조건 | 연결 테스트 | 상태 |
|---|---|---|---|---|---|---|
| A | pr-check 정리 | 개발 리드 | `.github/workflows/pr-check.yml` | `pr-check` 잡만, 트리거에 `auto_merge_enabled`·`auto_merge_disabled`, `size:large` + 예약 켜짐이면 실패 | PR #4 실측 | 대기 |
| B | 훅: 환경변수 접두사, neon 게시만 차단, 계정 전환 차단, fail-closed, 쓰기 `gh api` 판정, 머지 제한, `user-approved` 규칙 삭제 | 개발 리드 | `scripts/hooks/lib.sh` `guard-bash.sh` `neon-trigger.sh` | 플랜 "만들 것 5" | `guard-bash.test.sh` `neon-trigger.test.sh` | 대기 |
| C | watch-pr 분류, neon-review 계정·멘션, agent-env 점검 + SessionStart | 개발 리드 | `scripts/watch-pr.sh` `scripts/neon-review.sh` `scripts/agent-env.sh` `.claude/settings.json` | 플랜 "만들 것 3·4·6" | `watch-pr.test.sh` | 대기 |
| D | 규칙 문서 | 개발(Sonnet) | `AGENTS.md` `CLAUDE.md` | 플랜 "만들 것 2" 전부, 라벨 승인·`<!-- agent -->` 표식 문장 삭제 | — | 대기 |
| E | 전환·검증 | 개발 리드 + 사용자 | 브랜치 보호, `settings.local.json` | 플랜 "전환 순서"와 Verification "이 PR 안에서" | PR #4 실측 | 대기 |
