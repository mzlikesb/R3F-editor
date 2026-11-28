# 010 — 작업 목록

- 플랜: `docs/plans/010-dev-branch.md`
- 상태: 플랜 리뷰 이관 항목만 있다. 작업 분할은 개발 리드가 플랜 승인 뒤 채운다.

## 플랜 리뷰에서 넘어온 항목

플랜 리뷰가 3턴을 채웠다(`99a4418` → `5cf6fe2` → `b42fe64`, 마지막 반영 `03382fe`). 4턴째(`03382fe`) neon과 Codex(`6d4e815`) 지적도 여기에 넣었다. 그 뒤 지적은 플랜 파일을 고치지 않고 아래 수용 기준으로 넘긴다(`AGENTS.md` 3턴 규칙). 플랜 본문과 이 절이 다르면 **이 절이 이긴다**.

### R1. large → `dev`: 사용자가 Approve하고 직접 머지한다. 서버가 Approve를 확인한다 (neon 3·4턴)

- **플랜 C절의 "large는 에이전트가 auto-merge"와 그에 딸린 `guard-bash.sh` `--auto` 조건 변경은 하지 않는다**(neon 4턴 3). `main` 보호의 "마지막 push 승인"은 릴리스 PR의 head 브랜치(`release/*`) 기준이다. `release/*`는 에이전트가 push하므로, 사용자가 `dev`에 large를 직접 머지해도 릴리스 PR Approve가 막히지 않는다.
- large는 지금처럼 사용자가 Approve하고 직접 머지한다(base `dev`, squash). 에이전트 훅은 지금 그대로다(`--auto`는 small만).
- `dev`의 필수 Approve가 0이므로 `pr-check`(`DEV_FLOW=on`)가 서버 쪽에서 확인한다. base `dev`의 `size:large` PR은 **head SHA에 사용자(`mzlikesb`)의 APPROVED 리뷰가 없으면 실패**한다. `pr-check.yml` 트리거에 `pull_request_review`(`submitted`·`dismissed`)를 더한다.
- 테스트: large + Approve 없음 → 실패, large + head Approve → 통과, Approve 뒤 새 커밋 → 실패, small → Approve 무관.

### R1b. `dev` 브랜치는 사용자가 만든다 (neon 4턴 4)

- 010-1이 `guard-bash.sh`에 `dev` 직접 push 금지를 넣으면, 머지 뒤 에이전트는 `dev`를 push할 수 없다. 그래서 F절 (1)을 바꾼다. **사용자가 GitHub에서 `main`으로부터 `dev`를 만들고**(Branches → New branch, 또는 터미널 `git push origin main:dev`), 곧바로 보호 규칙을 건다. 생성과 보호 사이의 공백이 짧아진다.
- 기획은 그 뒤 열린 PR 이동(F절 (3))부터 한다.

### R1c. 릴리스 수정과 실수 squash 복구 (neon 4턴 5)

- 릴리스 PR에서 고칠 것이 나오면 `release/*`에 직접 커밋하지 않는다(`pr-check`의 "head가 `dev`의 조상" 규칙에 걸린다). 수정은 평소처럼 `dev`에 넣고, 기획이 새 `release/*`를 다시 잘라 릴리스 PR의 head를 바꾼다(기존 PR은 닫고 새로 연다).
- 릴리스 PR을 실수로 squash했으면, `main`을 `dev`에 합치는 복구 PR을 연다. **이 PR만은 merge commit으로 머지한다.** squash하면 `main` 커밋이 `dev`의 조상이 되지 않아 merge base가 갱신되지 않는다. `pr-check`는 base `dev` + head `main`일 때 이 예외를 허용하고(라벨 `release`), 사용자가 머지한다.

### R2. `dev`의 Codex 게이트: 최신 리뷰 기준, 요약 문구 포함, 사용자 탈출구 (neon 3턴 막는 문제 2)

- base `dev` PR의 `codex-reviewed` success 조건은 두 경로다.
  - (a) head SHA에 대한 **가장 최근** Codex 리뷰에 인라인 지적이 0건이고, 그 리뷰의 요약(또는 Codex 요약 코멘트)이 "지적 없음" 문구다(`Didn't find any major issues` 계열). 예전 리뷰의 지적은 보지 않는다.
  - (b) **탈출구**: head SHA에 대한 Codex 리뷰가 **끝나 있고**(결과 무관), 같은 head에 사용자(`mzlikesb`)의 APPROVED 리뷰가 있다. 오탐이나 경미한 지적을 코드 수정 없이 넘길 때 쓴다. Codex 리뷰가 아직 없는 head에서는 사용자 Approve만으로 통과하지 않는다(Codex P1 `6d4e815` — 사용자 Approve가 Codex 리뷰를 건너뛰는 길이 되지 않게).
- 요약 본문에만 막는 문제를 적고 인라인이 없는 경우는 (a)의 요약 문구 조건이 걸러 낸다.
- 기획이 지적을 "막지 않음"으로 판단하면 PR 코멘트에 근거를 남기고 사용자에게 (b)를 요청한다. 같은 head로 재리뷰를 요청해 통과시키려 하지 않는다.
- 판정 스크립트는 계속 기본 브랜치(`main`)의 것을 쓴다.
- 테스트: 최신 리뷰 지적 0 + 요약 "지적 없음" → success, 최신 리뷰에 인라인 지적 → pending, 예전 리뷰에만 지적·최신은 깨끗함 → success, 인라인 0이지만 요약에 지적 → pending, head에 Codex 리뷰 완료 + 사용자 Approve → success, Codex 리뷰 없는 head에 사용자 Approve만 → pending, base `main` → 지금 판정.

### R3. 이미 반영된 neon 3턴 지적 (확인만)

- 3(훅 변경 010-1로), 4(CODEOWNERS `scripts/**`·검사 설정), 5(릴리스 중 `dev` 경합 → `release/*` 스냅샷 브랜치)는 `03382fe`에 반영됐다. 010-1·010-2 구현이 플랜의 이 절들을 따르는지 QA가 확인한다.
