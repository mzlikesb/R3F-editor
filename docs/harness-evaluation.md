# OUTPOST 하네스 평가 보고서 (2026-11-28)

기준 시점: `main` (`9de3f8b`), PR #1~#120 운영 이력([retro.md](retro.md)), 하네스 테스트 16/16 통과(`bash scripts/run-tests.sh`).

---

## 1. 종합 요약

개인·소규모 에이전트 개발 하네스로는 **최상위권의 설계 완성도**를 갖추고 있다. "로컬 훅은 실수 방지, 진짜 잠금은 서버"라는 경계 설계와 이종 모델(Claude · Codex · neon) + 격리 페르소나 플레이테스트 조합이 실전에서 서로 다른 결함을 잡아내는 구조가 회고 데이터로 입증됐다.

M5 출시 시점에서 다음 병목은 **안전 부족이 아니라 운영 마찰(메타 작업·소규모 PR 승인 대기)**, **3D 동적 손맛 검증의 한계**, 그리고 **워크플로·스크립트·문서의 잔여 틈**이다.

| 영역 | 평가 | 핵심 근거 |
| --- | --- | --- |
| 거버넌스·안전 경계 | **매우 우수** | 신원 분리(`mzlikesb`/`chillingdaisy-worker1`), 서버 `codex-reviewed` 게이트, 기본 브랜치 판정 스크립트 실행, 메인 체크아웃 쓰기 차단 |
| 검증·품질 루프 | **우수** | neon(플랜·시각), Codex(코드·경계), QA, 격리 페르소나가 서로 다른 결함을 포착 |
| 하네스 자체 품질 | **매우 우수** | 스크립트 16개 전원 단위/통합 테스트 보유(`scripts/run-tests.sh`), 순수 로직·I/O 분리 |
| 운영 효율·사람 마찰 | **보통** | 최근 20커밋 중 9건이 `docs:`. M5 승인 대기 26~58분 증가, #96 이후 토큰 기록 13개 PR 연속 공백 |
| 3D 체감·연출 검증 | **보통** | 헤드리스 2~5fps와 정지 스크린샷 한계로 60fps·셰이크·콤보 검증 불가, 좌표 스윕 실패 사례 존재 |

---

## 2. 잘 작동하고 있는 설계 (유지 원칙)

1. **계층화된 안전 경계와 훅 절제**
   - [AGENTS.md](../AGENTS.md)와 [guard-bash.sh](../scripts/hooks/guard-bash.sh)가 훅을 보안 경계가 아닌 실수 방지 장치로 명확히 선을 긋고, 정규식 규칙 증식을 스스로 금지했다.
   - 진짜 잠금은 GitHub 서버(브랜치 보호, `enforce_admins`, `actionlint`, `codex-reviewed`)에 두고, [codex-gate.yml](../.github/workflows/codex-gate.yml)은 항상 `default_branch`의 판정 스크립트를 체크아웃한다.
   - [check-protection.sh](../scripts/check-protection.sh)로 문서의 잠금 주장과 GitHub 실설정을 대조한다(#1·#58 사고 재발 차단).
2. **역할이 겹치지 않는 다중 검증 체인**
   - **neon**: 상태 전이·격리 가정·로딩/시각 버그(#9, #30, #45, #47, #98, #109, #114)
   - **Codex**: 경계 조건·보정 회귀(#50, #53, #93, #113)
   - **페르소나 플레이테스트**: UX 인지 실패·CTA 회귀(#45, #47, #108, #114)
   - [playtest-lib.mjs](../scripts/playtest-lib.mjs)의 격리(allowlist + denylist 이중 차단, `init` 이벤트 실시간 검증 후 즉시 `SIGKILL`, production URL 차단)가 견고하다.
3. **2회 반복 시 규칙화 원칙**
   - 추측성 규칙 대신 실전 실패가 두 번 발생했을 때만 규칙·장치화(#8/#11 → `codex-gate`, #31/#41 → `run-tests.sh`, #30/#45 → 3턴 규칙, #93/#113 → 경계 회귀 테스트).

---

## 3. 발견된 약점과 개선 포인트

### A. 워크플로·스크립트의 실제 틈

1. **`snapshot-critique.sh`의 SHA 불일치 위험** ([snapshot-critique.sh](../scripts/snapshot-critique.sh))
   - `[sha]` 인자가 없으면 Preview가 서빙 중인 커밋 대신 `gh pr view`의 최신 `headRefOid`를 기록한다. Preview 배포 완료 전 실행하면 구 화면이 신 SHA로 기록된다.
2. **`codex-gate.yml`의 `cancel-in-progress: true`** ([codex-gate.yml](../.github/workflows/codex-gate.yml))
   - [pr-check.yml](../.github/workflows/pr-check.yml)은 #77 사고 후 `cancel-in-progress: false`로 수정됐으나 `codex-gate.yml`은 `true`로 남아 있다.
3. **`deploy.yml`의 외부 fork PR 가드 부재** ([deploy.yml](../.github/workflows/deploy.yml))
   - 공개 레포에서 외부 fork PR이 열리면 시크릿 없는 상태로 `preview`/`cleanup` job이 실행돼 실패한다. `github.event.pull_request.head.repo.full_name == github.repository` 조건이 필요하다.
4. **작은 중복과 하드코딩**
   - [neon-review.sh](../scripts/neon-review.sh)가 체크아웃 `HEAD`를 직접 쓰고 `neon-lib.sh`의 `neon_neutralize_mentions`를 공유하지 않는다.
   - [pr-tokens.sh](../scripts/pr-tokens.sh)에 로컬 폴더명 패턴(`-Users-*-money-working*`, `-Users-*-money-outpost-*`)이 하드코딩돼 있다.

### B. 운영 효율과 사람 병목

1. **메타 작업 루프의 오버헤드**: 최근 20커밋 중 9건이 `docs:`(회고·doc-lint 수정 A/B/C·규칙 반영). 문서 중복으로 인해 "회고 → doc-lint → 수정 PR 2~3개 → 각각 Codex 리뷰·사람 Approve" 순환 비용이 크다.
2. **M5 사람 대기 시간 증가 및 토큰 기록 중단**: [retro.md](retro.md)에서 승인 대기가 26~58분으로 늘었고, #96 이후 13개 PR 연속 토큰 칸이 `—`로 비어 있다.
3. **worktree 정리 누락**: [start-task/SKILL.md](../.claude/skills/start-task/SKILL.md)에 생성만 있고 [retro/SKILL.md](../.claude/skills/retro/SKILL.md)에 정리가 없어 `prunable` worktree가 잔존한다.

### C. 3D·UX 검증 사각지대와 현실적 분업

1. **헤드리스 2~5fps·정지 화면 한계**: 60fps 체감, 셰이크, 콤보, 색수차는 실기에서만 최종 판정 가능(#100, #108).
2. **좌표 스윕 취약성**: [snapshot.mjs](../scripts/snapshot.mjs)의 맹목적 좌표 스윕이 PC 선택 컷을 놓치거나(#68) 정상 패널을 못 찍는다(#112).
3. **플랜 전 스파이크 경로 부재**: 비주얼·핵심 메카닉 방향 결정은 문서 3턴 리뷰로 해결되지 않아 플랜을 뒤집는 비용이 발생했다(#98, #109).
4. **현실적 분업 방향 (사람 실기 헛걸음 최소화)**
   - **에이전트/자동화 (1차 불량 차단)**: 로컬 Mac GPU 가속(Metal/ANGLE) 기반 연사 5~6장 또는 짧은 영상으로 이펙트 미발동·잘림·겹침 확인 + 연출의 기하·색상 불변식(변위 수렴, HUD 비겹침 프레이밍, 톤매핑 후 색 거리) 수치 테스트(#51 패턴).
   - **사람 폰 실기 (최종 손맛 30초~1분 확인)**: `?perf` 디버그 쿼리에 고장 즉시 발생·수리/콤보·부품 스폰·정전 트리거 버튼을 확장해 기다리는 시간 없이 연출 전체를 바로 확인(#108 패턴).

### D. 확인된 문서 드리프트

1. [AGENTS.md](../AGENTS.md): *"페르소나 플레이테스트를 계속 쓸지는 첫 실행 결과를 보고 사용자가 정한다"* (이미 정착된 구 문구)
2. [how-it-was-built.md](how-it-was-built.md) vs [AGENTS.md](../AGENTS.md): `코드 리뷰`와 `플레이테스트` 순서가 반대
3. [pull_request_template.md](../.github/pull_request_template.md): 플랜·구현 PR 분할(#50) 이후에도 단일 PR 기준 템플릿 유지

---

## 4. 핵심 방향 전환: `small` PR 자동 승인 + 사용자 묶음 리뷰

GitHub 브랜치 보호는 PR 라벨(`size:small` vs `size:large`)별로 Approve 필수 여부를 다르게 설정할 수 없다. 따라서 자동 승인을 도입하면서도 **하네스·워크플로 자가 변경 권한 상승**을 막는 구조 선택이 필요하다.

### 대안 비교

| 기준 | 안 1: 통합 브랜치(`dev`) + `dev → main` 묶음 PR (권장) | 안 2: `main` 자동 승인 봇/Actions + 사후 묶음 다이제스트 |
| --- | --- | --- |
| `main` 브랜치 보호 | **100% 유지** (`approvals=1`, `enforce_admins=true`) | `main` 보호 유지하되 `GITHUB_TOKEN`/봇에 Approve 권한 부여 |
| `small` PR 머지 | `dev`로 자동 머지 (`ci` + `pr-check` + `codex-reviewed` 필수, 사람 Approve 생략) | `main`으로 자동 Approve → auto-merge |
| 사용자 묶음 리뷰 | `dev → main` PR 1개를 보고 Approve·머지 (**사전 검토**, 프로덕션 배포도 묶음) | 머지된 `small` PR 목록을 묶어 이슈/다이제스트로 검토 (**사후 검토**) |
| 하네스 자가 수정 방어 | `dev`에 들어가도 `main` 머지 시 사람 Approve 필수 → **원천 차단** | 자동 승인 워크플로에서 `.github/**`, `AGENTS.md`, `CLAUDE.md`, `scripts/hooks/**`, `scripts/codex-gate*`, `wrangler.*` 등 변경 시 **자동 승인 거부** 강제 필수 |
| 운영 복잡도 | 브랜치 2개(`main`, `dev`) 동기화 규칙 추가 (large PR 머지 후 `dev` 리베이스/머지) | 단일 브랜치 유지, 단 자동 승인 워크플로(`workflow_run` 또는 `default_branch` 기반) 설계 주의 필요 |

### 공통 필수 안전장치

- `ci`, `pr-check`, `actionlint`, `codex-reviewed` 필수 통과는 유지한다.
- 하네스·보안·배포 관련 파일(`.github/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `scripts/hooks/`, `scripts/codex-gate*`, `scripts/check-protection.sh`, `wrangler.*`)을 건드리는 PR은 크기와 무관하게 **자동 승인 대상에서 제외**한다.
- `size:large` PR은 기존대로 사용자 Approve + 직접 머지를 유지한다.

---

## 5. 등록된 후속 이슈

- `#121`: 하네스: small PR 자동 승인 + 사용자 묶음 리뷰 전환
- `#122`: 하네스 평가 후속: 워크플로·스냅샷 보강, 문서 드리프트, 회고·worktree 정리
