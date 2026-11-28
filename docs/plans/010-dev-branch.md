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
2. **`dev` 보호 규칙**(사용자가 설정한다, F절):
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
  - `scripts/hooks/**`, `scripts/codex-gate*`, `scripts/check-protection.sh`
  - `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/**`
  - `wrangler.*`, `package.json`, `package-lock.json`
  - `scripts/bundle-budget.mjs`
- `dev` 보호의 "코드 주인 리뷰 필수"를 켠다. 그러면 보호 경로를 건드린 PR만 사용자 Approve가 필요하고, 나머지 small PR은 자동으로 머지된다.
- `main`에서도 CODEOWNERS는 같은 파일이 적용된다. 릴리스 PR은 어차피 사용자 Approve를 거친다.
- 테스트(`scripts/`): CODEOWNERS의 경로 목록이 `AGENTS.md`의 보호 경로 목록과 같은지 확인한다(문서와 설정이 같이 움직이게).

### C. 머지 방식 — PR은 squash, 릴리스는 merge commit

- `dev`로 가는 PR은 지금처럼 squash한다.
- `dev → main` 릴리스 PR은 **merge commit**으로 머지한다. squash하면 `main`에 새 커밋이 생겨 `dev`와 기록이 갈라지고, 다음 릴리스 diff에 이미 나간 변경이 다시 보이거나 충돌이 난다.
- GitHub 보호 규칙은 PR마다 머지 방식을 다르게 둘 수 없다. 그래서 저장소 설정에서 merge commit과 squash를 둘 다 허용하고, `pr-check`가 아래를 강제한다.
  - base가 `main`이면 head는 `dev`여야 한다(릴리스 PR만 `main`으로 간다).
  - 릴리스 PR에는 라벨 `release`가 붙는다. `size:*` 대신 이 라벨을 쓴다.
  - base가 `dev`면 지금 규칙(size·stage·마일스톤·관련 이슈)을 그대로 적용한다.
  - auto-merge 예약은 base가 `dev`인 small에만 허용한다. 릴리스 PR과 large는 사용자가 머지한다.
- 머지 방식은 GitHub이 PR에서 강제할 수 없다. 그래서 릴리스 PR 본문 맨 위에 "merge commit으로 머지"를 적고, `check-protection.sh`가 `main`의 merge commit 허용을 확인한다. 실수로 squash했으면 다음 릴리스 전에 `main`을 `dev`에 merge해서 맞춘다(강제 push는 쓰지 않는다).

### D. 배포

- production은 지금처럼 `main` push 때만 배포한다(`deploy.yml`).
- PR Preview(`pr-N`)는 base와 관계없이 지금처럼 만든다.
- **staging**: `dev` push 때 고정 Preview(`dev-outpost`)에 배포한다. 여러 PR이 합쳐진 상태를 릴리스 전에 이 주소에서 확인한다. DO 저장소는 staging 전용이다(production과 분리).

### E. 릴리스 절차

1. 기획 에이전트가 `dev`가 `main`보다 앞서 있으면 릴리스 PR(`dev → main`)을 연다. 본문에는 다음을 적는다.
   - 포함된 PR 목록(번호·제목·등급)
   - staging 주소
   - 하네스 파일 변경 여부
   - 머지 방식(merge commit)
   - 여는 시점은 아래 중 먼저 오는 것이다.
     - 사용자가 요청할 때
     - small이 3개 이상 쌓였을 때
     - large가 `dev`에 머지됐을 때
2. 릴리스 PR에도 `codex-reviewed`가 필요하다. 릴리스 head로 `@codex review`를 요청한다.
3. 사용자가 staging을 확인하고 Approve한 뒤 **merge commit**으로 머지한다. 그러면 production에 배포된다.
4. production 문제는 `wrangler rollback`으로 먼저 되돌린다(사용자 승인). 수정은 평소처럼 `dev`로 넣고 다음 릴리스로 내보낸다. **`main`으로 바로 가는 hotfix 경로는 두지 않는다**(사용자 결정).

### F. 사용자가 할 설정 (구현 PR 010-1 머지 뒤 기획이 안내한다)

- Settings → General → Pull Requests: **Allow merge commits** 켬. squash는 켠 채로 둔다.
- Settings → Branches → `main`: Require linear history가 켜져 있으면 끈다.
- Settings → Branches → Add rule `dev`: A.2대로 설정한다.
- 설정한 뒤 `scripts/check-protection.sh`를 실행한다(G절에서 `dev`까지 대조하게 고친다).

### G. 고칠 도구와 문서

`main`을 전제로 한 곳을 `dev` 기준으로 바꾼다. 훅 규칙은 늘리지 않는다(기존 규칙의 대상 브랜치만 맞춘다).

- **작업 시작**:
  - `start-task` 스킬: worktree를 `origin/dev`에서 만들고, PR을 `--base dev`로 연다.
  - `guard-write.sh`·`guard-bash.sh` 안내 문구의 `origin/main`을 `origin/dev`로 바꾼다.
- **메인 체크아웃**: 메인 체크아웃은 지금처럼 `main`을 따라간다. 훅이 메인 체크아웃 기준으로 돌기 때문이다. 다만 하네스 변경은 `dev`에 먼저 들어가고, 릴리스 뒤에야 메인 체크아웃에 반영된다. 이 차이를 `AGENTS.md`에 적는다.
- **훅**:
  - `guard-bash.sh`의 "main 직접 push 금지"에 `dev`도 같은 규칙으로 넣는다. 서버 보호가 진짜 잠금이고, 훅은 실수 방지다.
  - `neon-trigger.sh`의 기준 브랜치를 PR의 base로 바꾼다.
- **CI·검사**:
  - `ci.yml`의 push 트리거에 `dev`를 더한다.
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
| 010-1 | B(CODEOWNERS + 테스트) + C의 `pr-check` 규칙 + `ci.yml` 트리거 + `check-protection.sh` `dev` 대조 + `dev` 브랜치 생성 | 없음  |
| 010-2 | D(staging 배포) + E(`release-notes.sh`, 릴리스 PR 절차) + G의 스킬·훅·스크립트·문서 | 010-1 |

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
  - `pr-check` 규칙 테스트: base `dev`의 small·large, base `main`의 릴리스(head `dev` + `release`), base `main`의 일반 PR(거절), `dev` 대상 large에 auto-merge가 예약된 경우(거절)
  - CODEOWNERS와 `AGENTS.md` 보호 경로가 일치하는지 확인하는 테스트
  - `check-protection.sh`가 `dev` 규칙이 없거나 다를 때 실패하는지 확인하는 테스트(가짜 gh)
- F절 설정 뒤 `check-protection.sh`가 "일치"를 보고한다(사용자 실행)
- 첫 실전(010-2 이후):
  - 보호 경로를 안 건드린 small PR이 `dev`로 Approve 없이 자동 머지된다
  - 보호 경로를 건드린 small PR은 사용자 Approve를 기다린다
  - `dev` push 뒤 staging에 배포된다
  - 릴리스 PR이 merge commit으로 머지되고 production에 배포된다
  - 다음 릴리스 PR diff에 이미 나간 변경이 다시 보이지 않는다
- 기존 검사(`npm test`, `test:hooks`, `actionlint`)는 통과한다
