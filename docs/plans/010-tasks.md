# 010 — 작업 목록

- 플랜: `docs/plans/010-dev-branch.md`
- 상태: 플랜 리뷰 이관 항목만 있다. 작업 분할은 개발 리드가 플랜 승인 뒤 채운다.

## 플랜 리뷰에서 넘어온 항목

플랜 리뷰가 3턴을 채웠다(`99a4418` → `5cf6fe2` → `b42fe64`, 마지막 반영 `03382fe`). 그 뒤 지적은 플랜 파일을 고치지 않고 아래 수용 기준으로 넘긴다(`AGENTS.md` 3턴 규칙). 플랜 본문과 이 절이 다르면 **이 절이 이긴다**.

### R1. large → `dev`: 미리 예약하고, 사용자 Approve가 있어야 통과한다 (neon 3턴 막는 문제 1)

- `pr-check`(`DEV_FLOW=on`일 때): base `dev`의 `size:large` PR은 **head SHA에 사용자(`mzlikesb`)의 APPROVED 리뷰가 없으면 실패**한다. 필수 Approve가 0이어도 large는 Approve 없이 머지되지 않는다.
- 에이전트는 large PR을 ready로 열 때 곧바로 `gh pr merge <번호> --auto --squash`로 예약한다. 이때 `pr-check`는 실패 상태라 PR이 머지 가능 상태가 아니다. 그래서 GitHub이 예약을 거절하지 않는다(이미 머지 가능한 PR에는 예약이 거절된다).
- 사용자가 Approve하면 `pr-check`가 다시 돌아 통과하고, auto-merge가 머지한다. pusher는 예약한 에이전트 계정이다. 사용자가 `dev`의 마지막 pusher가 되지 않는다.
- 이를 위해 `pr-check.yml` 트리거에 `pull_request_review`(`submitted`·`dismissed`)를 더한다.
- `guard-bash.sh` `--auto` 허용 조건은 "base `dev`의 PR"로 단순화한다. 승인 확인은 서버(`pr-check`)가 한다. 이 훅 변경은 010-1에 넣는다.
- 테스트: large + Approve 없음 → 실패, large + head Approve → 통과, Approve 뒤 새 커밋(Approve 해제) → 실패, small → Approve 무관.

### R2. `dev`의 Codex 게이트: 최신 리뷰 기준, 요약 문구 포함, 사용자 탈출구 (neon 3턴 막는 문제 2)

- base `dev` PR의 `codex-reviewed` success 조건은 두 경로다.
  - (a) head SHA에 대한 **가장 최근** Codex 리뷰에 인라인 지적이 0건이고, 그 리뷰의 요약(또는 Codex 요약 코멘트)이 "지적 없음" 문구다(`Didn't find any major issues` 계열). 예전 리뷰의 지적은 보지 않는다.
  - (b) **탈출구**: head SHA에 사용자(`mzlikesb`)의 APPROVED 리뷰가 있다. 오탐이나 경미한 지적을 코드 수정 없이 넘길 때 쓴다. 사용자가 판단한다.
- 요약 본문에만 막는 문제를 적고 인라인이 없는 경우는 (a)의 요약 문구 조건이 걸러 낸다.
- 기획이 지적을 "막지 않음"으로 판단하면 PR 코멘트에 근거를 남기고 사용자에게 (b)를 요청한다. 같은 head로 재리뷰를 요청해 통과시키려 하지 않는다.
- 판정 스크립트는 계속 기본 브랜치(`main`)의 것을 쓴다.
- 테스트: 최신 리뷰 지적 0 + 요약 "지적 없음" → success, 최신 리뷰에 인라인 지적 → pending, 예전 리뷰에만 지적·최신은 깨끗함 → success, 인라인 0이지만 요약에 지적 → pending, head에 사용자 Approve → success, base `main` → 지금 판정.

### R3. 이미 반영된 neon 3턴 지적 (확인만)

- 3(훅 변경 010-1로), 4(CODEOWNERS `scripts/**`·검사 설정), 5(릴리스 중 `dev` 경합 → `release/*` 스냅샷 브랜치)는 `03382fe`에 반영됐다. 010-1·010-2 구현이 플랜의 이 절들을 따르는지 QA가 확인한다.
