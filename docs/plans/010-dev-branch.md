# 010 — 통합 브랜치 `dev`: small은 바로 쌓고, 사용자는 묶어서 본다

- 브랜치: `chore/010-dev-branch`
- 등급: large
- 관련 이슈: Closes #121
- 마일스톤: M5 출시
- 상태: 플랜 리뷰

## Context

지금은 모든 PR이 `main`으로 가고, 사람 Approve 1개가 필수다. small PR(문서, doc-lint 수정, 작은 UI·버그 수정)도 매번 사용자 Approve를 기다린다. 회고(#110·#111·#112)를 보면 열림→머지 31~42분 중 Approve 대기가 26~40분이었다. 가장 큰 시간 항목이 사람 대기다.

사용자 결정(#121, 2026-11-28): **안 1, 통합 브랜치 `dev`.**

- 모든 PR은 `dev`로 간다. small은 체크와 Codex 리뷰를 통과하면 사람 Approve 없이 자동으로 머지된다.
- 사용자는 쌓인 변경을 `dev → main` 릴리스 PR 하나로 묶어서 보고, Approve하고, 머지한다. production 배포는 그때만 일어난다.
- `main`의 브랜치 보호는 그대로 둔다(Approve 1, `enforce_admins`, 필수 체크 4개).

이 플랜은 하네스 구조를 바꾼다. 게임 코드는 바꾸지 않는다.

## 만들 것

### A. 브랜치와 보호 규칙

1. `dev`는 `main`에서 만든다. 기본 브랜치는 `main`으로 둔다. Codex 게이트(`codex-gate.yml`)가 기본 브랜치의 판정 스크립트만 믿기 때문이다.
2. **`dev` 보호 규칙**(사용자가 설정한다, F절). `dev`의 커밋은 모두 auto-merge(에이전트 계정)로만 들어온다(C절):
   - PR 필수, 필수 Approve 0
   - **코드 주인 리뷰 필수**(B절)
   - 새 커밋이 오면 기존 Approve 해제
   - 필수 체크: `ci`, `pr-check`, `actionlint`, `codex-reviewed`
   - 관리자 우회 금지, 강제 push·삭제 금지
3. **`main` 보호 규칙**은 그대로 둔다. merge commit만 저장소 설정에서 허용한다(C절).

### B. 하네스 파일은 여전히 사용자 Approve — CODEOWNERS

`dev`는 Approve 없이 머지되므로, 에이전트가 small PR로 하네스를 바꿔 다음 PR들의 검사를 약하게 만들 수 있다. 이걸 막는다.

- `.github/CODEOWNERS`를 만든다. 아래 보호 경로의 주인을 `@mzlikesb`로 둔다.
  - `.github/**`
  - `scripts/**`(훅·게이트·검사·지표·릴리스 스크립트 전부)
  - `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/**`, `docs/templates/**`
  - `wrangler.*`, `package.json`, `package-lock.json`, `.nvmrc`
  - 검사·빌드 설정: `tsconfig*.json`, `vite.config.*`, `vitest.config.*`·`vitest.workspace.*`, `.oxlintrc*`, `.prettierrc*`·`.prettierignore`
  - 위 목록에 없는 루트 설정 파일이 새로 생기면 같은 PR에서 목록과 `AGENTS.md`를 함께 고친다(일치 테스트가 잡는다).
- `dev` 보호의 "코드 주인 리뷰 필수"를 켠다. 그러면 보호 경로를 건드린 PR만 사용자 Approve가 필요하고, 나머지 small PR은 자동으로 머지된다.
- `main`에서도 CODEOWNERS는 같은 파일이 적용된다. 릴리스 PR은 어차피 사용자 Approve를 거친다.
- 테스트(`scripts/`): CODEOWNERS의 경로 목록이 `AGENTS.md`의 보호 경로 목록과 같은지 확인한다(문서와 설정이 같이 움직이게).

### B2. Approve 0에서 Codex 지적이 그냥 머지되지 않게

지금은 Codex가 지적을 남겨도, 고치기 전 머지를 막는 브레이크가 사용자 Approve였다. `dev`는 Approve가 0이므로 이 브레이크가 없다.

- `codex-reviewed` 판정(`scripts/codex-gate.sh`, 기본 브랜치 스크립트)에 조건을 더한다. **base가 `dev`인 PR은 head SHA에 대한 Codex 리뷰에 인라인 지적이 하나도 없을 때만 success다.** 요약만 있고 인라인 지적이 없으면 success이고, 지적이 있으면 pending이다. 지적을 반영해 새 커밋을 push하면 다시 리뷰받는다.
- base가 `main`인 PR(릴리스)은 지금 판정 그대로다. 사람 Approve가 브레이크다.
- 기획은 지적을 "막지 않음"으로 판단하더라도 무시하지 않는다. 반영하거나, 이슈로 넘기고 PR 코멘트로 근거를 남긴 뒤 다시 `@codex review`를 요청한다.
- 테스트: 지적 없는 리뷰는 success, 인라인 지적이 있는 리뷰는 pending, 지적 뒤 새 head에서 지적 없는 리뷰는 success, base `main`은 지금 판정.

### C. 머지 방식 — PR은 squash, 릴리스는 merge commit

- `dev`로 가는 PR은 지금처럼 squash한다.
- 릴리스는 `dev`를 그대로 `main`에 보내지 않는다. 기획이 `dev`에서 **스냅샷 브랜치 `release/<YYYYMMDD>-<n>`**를 잘라 `main`으로 PR을 연다. 릴리스 PR이 열려 있는 동안 `dev`가 계속 움직여도 릴리스 head·Codex 리뷰·사용자 Approve·staging 확인 대상이 바뀌지 않는다. 그 사이 `dev`에 들어온 변경은 다음 릴리스로 간다.
- 릴리스 PR은 **merge commit**으로 머지한다. squash하면 `main`에 새 커밋이 생겨 `dev`와 기록이 갈라지고, 다음 릴리스 diff에 이미 나간 변경이 다시 보이거나 충돌이 난다.
- GitHub 보호 규칙은 PR마다 머지 방식을 다르게 둘 수 없다. 그래서 저장소 설정에서 merge commit과 squash를 둘 다 허용하고, `pr-check`가 아래를 강제한다.
- **켜는 스위치**: 아래 규칙은 저장소 변수 `DEV_FLOW`가 `on`일 때만 적용한다(`vars.DEV_FLOW`, 사용자가 F절에서 켠다). 꺼져 있으면 `pr-check`는 지금 규칙 그대로다. 010-1은 자기 자신이 `main`으로 가는 PR이라, 스위치 없이 규칙을 넣으면 스스로 거절돼 머지할 수 없다(Codex P1).
  - base가 `main`이면 head는 `release/*`여야 하고, head 커밋이 `dev`의 조상이어야 한다(`dev`에서 자른 스냅샷만 `main`으로 간다).
  - 릴리스 PR에는 라벨 `release`가 붙는다. `release`가 `size:*`와 `stage:*`를 대신한다(둘 다 없어야 한다). 마일스톤은 필수, `- 관련 이슈:`는 `없음`을 허용한다. `release` 라벨은 010-1에서 만든다.
  - base가 `dev`면 지금 규칙(size·stage·마일스톤·관련 이슈)을 그대로 적용한다.
  - base `dev`의 small은 auto-merge 예약을 허용한다.
  - base `dev`의 **large는 사용자 Approve 리뷰가 있을 때만** auto-merge 예약을 허용한다. 사용자가 Approve하면 에이전트가 예약한다. 사용자가 직접 `dev`에 머지하지 않는 이유는 "마지막 push 승인" 때문이다. 사용자가 `dev`의 마지막 pusher가 되면, `main` 보호의 "마지막 push도 승인 필요" 규칙 때문에 다음 릴리스 PR을 사용자 본인이 Approve할 수 없다. auto-merge가 머지하면 예약한 에이전트 계정이 pusher가 된다.
  - 이에 맞춰 `guard-bash.sh`의 `gh pr merge --auto` 허용 조건(small만)을 "base `dev`의 small, 또는 사용자 Approve가 있는 large"로 바꾼다. 새 규칙을 늘리는 게 아니라 기존 규칙의 조건을 바꾸는 것이다. **이 훅 변경은 010-1에 넣는다.** 훅은 메인 체크아웃(`main`) 버전이 돌므로, `dev`로 가는 010-2에 넣으면 첫 릴리스 전까지 적용되지 않아 010-2(large) 자신을 예약할 수 없다(Codex P1).
  - 릴리스 PR은 지금 large처럼 사용자가 직접 머지한다(merge commit). 릴리스 브랜치는 기획(에이전트 계정)이 push하므로 마지막 pusher는 에이전트다. `main`으로 가는 머지라 `dev`의 pusher와도 상관없다.
- `main`에는 릴리스 merge commit이 쌓이고 `dev`에는 없다. 다음 릴리스 diff(`main...release/*`)는 merge base 기준이라 이미 나간 변경을 다시 보이지 않는다.
- 머지 방식은 GitHub이 PR에서 강제할 수 없다. 그래서 릴리스 PR 본문 맨 위에 "merge commit으로 머지"를 적고, `check-protection.sh`가 `main`의 merge commit 허용을 확인한다. 실수로 squash했으면 다음 릴리스 전에 `main`을 `dev`에 merge하는 PR로 맞춘다(강제 push는 쓰지 않는다).

### D. 배포

- production은 지금처럼 `main` push 때만 배포한다(`deploy.yml`).
- PR Preview(`pr-N`)는 base와 관계없이 지금처럼 만든다.
- **staging**: `dev` push 때 PR Preview와 **같은 방식**(`wrangler preview --name <이름>`, Preview마다 DO 저장소가 따로)으로 이름 `dev`인 고정 Preview에 배포한다(`dev-outpost.<계정>.workers.dev`). production Worker·DO는 건드리지 않는다. 새 `wrangler` 환경이나 DO 바인딩·마이그레이션은 만들지 않는다.
  - `deploy.yml`의 PR 정리 job(`cleanup`)은 PR이 닫힐 때 `pr-N`만 지운다. `dev`는 지우지 않는다(이름 조건 테스트).
  - staging 배포 job도 기존 preview job처럼 Cloudflare 토큰을 wrangler step에만 넘긴다. 새 시크릿은 필요 없다.
  - 여러 PR이 합쳐진 상태를 릴리스 전에 이 주소에서 확인한다.

### E. 릴리스 절차

1. 기획 에이전트가 `dev`가 `main`보다 앞서 있으면 `dev`의 지금 커밋에서 `release/<YYYYMMDD>-<n>`를 잘라 push하고 `main`으로 릴리스 PR을 연다. staging은 이 릴리스 커밋으로 한 번 더 배포한다(`release` 브랜치 push 때도 같은 고정 Preview를 갱신하지 않는다 — staging은 `dev`만 따라가고, 릴리스 확인은 릴리스 PR의 `pr-N` Preview로 한다). 본문에는 다음을 적는다.
   - 포함된 PR 목록(번호·제목·등급)
   - 릴리스 PR Preview 주소(이 릴리스와 같은 코드)와 staging 주소(`dev` 최신)
   - 하네스 파일 변경 여부
   - 머지 방식(merge commit)
   - 여는 시점은 아래 중 먼저 오는 것이다.
     - 사용자가 요청할 때
     - small이 3개 이상 쌓였을 때
     - large가 `dev`에 머지됐을 때
2. 릴리스 PR에도 `codex-reviewed`가 필요하다. 릴리스 head로 `@codex review`를 요청한다.
3. 사용자가 릴리스 PR Preview를 확인하고 Approve한 뒤 **merge commit**으로 머지한다. 그러면 production에 배포된다. 머지 뒤 릴리스 브랜치는 지운다.
4. production 문제는 `wrangler rollback`으로 먼저 되돌린다(사용자 승인). 수정은 평소처럼 `dev`로 넣고 다음 릴리스로 내보낸다. **`main`으로 바로 가는 hotfix 경로는 두지 않는다**(사용자 결정).

### F. 사용자가 할 설정 (구현 PR 010-1 머지 뒤 기획이 안내한다)

- Settings → General → Pull Requests: **Allow merge commits** 켬. squash는 켠 채로 둔다.
- Settings → Branches → `main`: Require linear history가 켜져 있으면 끈다.
- Settings → Branches → Add rule `dev`: A.2대로 설정한다.
- **전환 순서**: (1) 010-1 머지 뒤 기획이 `dev`를 `main`에서 만든다. (2) 사용자가 위 설정(merge commit 허용, `dev` 보호 규칙)을 한다. **보호가 켜지기 전에는 어떤 PR도 `dev`로 옮기지 않는다.** (3) 기획이 `main`으로 열려 있는 PR 목록을 만들고, 사용자 확인 뒤 `gh pr edit <번호> --base dev`로 옮긴다(auto-merge 예약은 옮긴 뒤 다시 확인). (4) 사용자가 Settings → Secrets and variables → Actions → Variables에 `DEV_FLOW` = `on`을 만든다. 이 순간부터 C절 규칙이 적용된다.
- 설정한 뒤 `scripts/check-protection.sh`를 실행한다(G절에서 `dev`와 `DEV_FLOW`까지 대조하게 고친다).

### G. 고칠 도구와 문서

`main`을 전제로 한 곳을 `dev` 기준으로 바꾼다. 훅 규칙은 늘리지 않는다(기존 규칙의 대상 브랜치만 맞춘다).

- **작업 시작**:
  - `start-task` 스킬: worktree를 `origin/dev`에서 만들고, PR을 `--base dev`로 연다.
  - `guard-write.sh`·`guard-bash.sh` 안내 문구의 `origin/main`을 `origin/dev`로 바꾼다.
- **메인 체크아웃**: 메인 체크아웃은 지금처럼 `main`을 따라간다. 훅이 메인 체크아웃 기준으로 돌기 때문이다. 다만 하네스 변경은 `dev`에 먼저 들어가고, 릴리스 뒤에야 메인 체크아웃에 반영된다. 이 차이를 `AGENTS.md`에 적는다.
- **훅**:
  - `guard-bash.sh`의 "main 직접 push 금지"에 `dev`도 같은 규칙으로 넣는다(010-1에서 `--auto` 조건과 함께). 서버 보호가 진짜 잠금이고, 훅은 실수 방지다.
  - `neon-trigger.sh`의 기준 브랜치를 PR의 base로 바꾼다.
- **CI·검사**:
  - `ci.yml`의 push 트리거에 `dev`를 더한다. `pull_request` 트리거는 `ci.yml`·`pr-check.yml`·`codex-gate.yml`·`deploy.yml`(preview) 모두 브랜치 제한이 없어 `dev`·`release/*` PR에도 돈다 — 010-1에서 이 사실을 확인하고, `actionlint` 워크플로도 확인한다.
  - `pr-check.yml`에 C절 규칙을 넣는다.
  - `deploy.yml`에 D절 staging job을 넣는다.
- **스크립트**:
  - `check-protection.sh`: `dev` 보호와 merge commit 허용까지 대조한다.
  - `watch-pr.sh`·`pr-stats`·`pr-tokens`: base와 무관하게 동작하는지 확인하고, 필요하면 고친다.
  - 릴리스 PR 본문 초안을 만드는 `scripts/release-notes.sh`를 새로 만든다(`git log main..dev`에서 PR 번호 추출).
- **스킬**:
  - `retro`: 머지 기준을 `dev` 머지로 바꾼다.
  - `playtest`: Preview는 그대로라 바꿀 것이 없다.
  - 일일 감사: `dev` 기준으로 돌게 감사 트리거 프롬프트를 바꾼다(사용자 승인, 트리거 수정은 기획이 한다).
- **문서**:
  - `AGENTS.md`: 워크플로, 승인과 머지, 브랜치 보호, 병렬 세션 규칙, 배포·롤백 절을 고친다.
  - `CLAUDE.md`: PR 감시 절을 고친다.
  - `docs/how-it-was-built.md`도 고친다.

### 구현 PR 나누기

| PR    | 내용                                                                                    | 의존  |
| ----- | --------------------------------------------------------------------------------------- | ----- |
| 010-1 | B(CODEOWNERS + `AGENTS.md`에 보호 경로 목록 + 일치 테스트) + B2(codex-gate `dev` 판정) + C의 `pr-check` 규칙(`DEV_FLOW` 스위치, `release/*`) + `guard-bash.sh` `--auto` 조건 + `ci.yml` 트리거 + `check-protection.sh` `dev` 대조 + `release` 라벨 + `dev` 브랜치 생성 | 없음  |
| 010-2 | D(staging 배포) + E(`release-notes.sh`·릴리스 브랜치 절차) + G의 나머지(스킬·안내 문구·`neon-trigger.sh`·문서) | 010-1 |

- 010-1은 `main`으로 머지한다. `dev`가 아직 없거나 보호되지 않았기 때문이다. 머지 뒤 기획이 `dev`를 `main`에서 만들고, 사용자가 F절 설정을 한다.
- 010-2부터는 `dev`로 간다. 첫 릴리스 PR로 `main`에 들어간다. 그 릴리스가 새 절차의 첫 실전 확인이다.

## 하지 않는 것

- `main` 보호 규칙 완화, `main`에서 자동 Approve(안 2)
- `main`으로 바로 가는 hotfix 브랜치
- 기본 브랜치를 `dev`로 바꾸는 것
- 릴리스를 정해진 주기로 자동으로 여는 것(E.1의 계기만 쓴다)
- 게임 코드 변경

## Verification

- 010-1:
  - `pr-check` 규칙 테스트: `DEV_FLOW` 꺼짐에서는 지금 규칙 그대로(010-1 자신이 통과), 켜짐에서 base `dev`의 small·large, base `main`의 릴리스(head `release/*`가 `dev`의 조상 + `release` 라벨, size·stage 없음), head가 `dev`의 조상이 아닌 `release/*`(거절), base `main`의 일반 PR(거절), Approve 없는 `dev` 대상 large에 auto-merge가 예약된 경우(거절)
  - CODEOWNERS와 `AGENTS.md` 보호 경로가 일치하는지 확인하는 테스트(같은 PR에 `AGENTS.md` 목록을 넣는다)
  - codex-gate: base `dev`에서 인라인 지적이 있으면 pending, base `main`은 지금 판정
  - `guard-bash.sh` `--auto` 조건: base `dev` small 허용, Approve 있는 large 허용, Approve 없는 large 거절
  - `deploy.yml` cleanup이 `dev`를 지우지 않음
  - `check-protection.sh`가 `dev` 규칙이 없거나 다를 때 실패하는지 확인하는 테스트(가짜 gh)
- F절 설정 뒤 `check-protection.sh`가 "일치"를 보고한다(사용자 실행)
- 첫 실전(010-2 이후):
  - 보호 경로를 안 건드린 small PR이 `dev`로 Approve 없이 자동 머지된다
  - 보호 경로를 건드린 small PR은 사용자 Approve를 기다린다
  - `dev` push 뒤 staging에 배포된다
  - large를 사용자 Approve 뒤 auto-merge로 `dev`에 넣은 다음, 릴리스 PR을 사용자가 Approve할 수 있다(마지막 pusher 교착 없음)
  - Codex가 인라인 지적을 남긴 small PR은 `dev`에 자동 머지되지 않는다
  - 릴리스 PR이 열려 있는 동안 small이 `dev`에 머지돼도 릴리스 PR head·Approve·Codex 상태가 그대로다
  - 릴리스 PR이 merge commit으로 머지되고 production에 배포된다
  - 다음 릴리스 PR diff에 이미 나간 변경이 다시 보이지 않는다
- 기존 검사(`npm test`, `test:hooks`, `actionlint`)는 통과한다
