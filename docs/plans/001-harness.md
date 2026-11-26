# 001 — 하네스 코어·개발환경 세팅

- 브랜치: `chore/harness-setup`
- 등급: **large** (사용자 머지)
- 관련 이슈: 없음
- 마일스톤: M0 하네스
- 상태: 플랜 리뷰 3턴 — Codex·neon 승인, 사용자 승인 대기

## Context
OUTPOST(`docs/content-plan.md`)를 만들기 전에, 실제 팀처럼 PR 단위로 굴러가는 개발 프로세스를 먼저 세운다.
이 프로젝트 규모에는 무거운 구성이지만, 프로세스를 직접 운영해 보는 게 목적 중 하나다.
레포는 공개이고, 플랜·리뷰·플레이테스트 기록이 남는 것 자체를 보여준다.

하네스는 두 PR로 나눈다.
- **001 (이 PR) — 코어:** 스캐폴드, Worker/DO 에코, 규칙 문서, CI·pr-check·배포, 승인·머지 장치, 핵심 훅, 기본 템플릿
- **002 — 자동화:** 플레이테스트 격리 실행, 페르소나, 프로젝트 스킬, 세션 요약·상태줄, 품질 감사. 001이 만든 체인을 처음으로 정식으로 타는 PR이 된다

**부트스트랩 예외:** 이 PR은 리뷰 자동화가 들어가기 전이라 정식 체인을 다 타지 못한다.
플랜 리뷰는 Codex·neon·사용자, 코드 리뷰는 웹 Codex(`@codex review`)와 사용자가 한다.

**M0 종료 기준:** 새 체크아웃에서 필수 CI가 돌고, PR Preview(또는 staging)에서 큐브와 WS 에코를 확인하고, 사용자가 머지하면 M0를 닫는다.

## 워크플로우
```
브랜치 생성 → docs/plans/NNN-*.md 작성 → draft PR
  → 플랜 리뷰: Codex(웹) + neon(Gemini) → 사용자   (최대 3턴, 결론은 사용자가 냄)
  → 승인(plan-approved 라벨)
  → 개발 리드(Opus): 작업 분할(tasks.md) + 테스트 먼저 작성 (서버 로직·UI 로직만)
  → 개발(Sonnet): 구현
  → QA(Opus): 명세 대비 검증, 실패 시 개발로 반려
  → Preview/staging 배포 → 플레이테스트 (기능 PR부터, 002에서 자동화)
  → PR ready → 최종 SHA에 코드 리뷰: Codex(웹) → 사용자
  → 사용자 "리뷰 끝났어" → 반영 → CI 통과
  → 사용자가 최종 커밋 확인 후 user-approved 라벨
  → small: auto-merge / large: 사용자 머지 → main 머지 시 production 자동 배포
```

### 리뷰 기록
같은 PR에서 플랜 리뷰 뒤 구현이 이어지므로, 각 리뷰가 어느 커밋을 봤는지 남긴다.
- 리뷰는 **PR 코멘트**로 남긴다(파일 안에 쓰지 않는다)
- PR 본문의 `리뷰 기록` 표: `단계 · 리뷰어 · 대상 SHA · 판정`. 리뷰가 끝날 때마다 담당 에이전트가 한 줄 추가
- ready 전환 시 최종 SHA로 `@codex review` 요청. 지적 반영으로 코드가 바뀌면 그 SHA도 리뷰됐는지 머지 전에 확인
- neon이 한도·CLI 오류로 못 돌면 `skipped(사유)`로 기록하고 다음 단계로 진행한다

### 승인과 머지
모든 PR을 사용자 계정(`mzlikesb`)으로 열기 때문에 GitHub의 필수 Approve는 본인이 충족할 수 없다. 그래서 승인은 라벨로 한다.
- 브랜치 보호(main): 필수 체크 `ci`, `pr-check`, `user-approval`. Approve 필수는 끈다
- **`user-approved` 라벨은 사용자만 단다.** 에이전트가 이 라벨을 다는 명령은 훅으로 막는다
- 새 커밋이 올라오면 워크플로우가 `user-approved`를 자동으로 떼고 코멘트를 남긴다 → 승인은 항상 최종 커밋 기준
- `user-approval` 체크는 라벨이 있을 때만 통과
- small: `small + user-approved + ready`가 모두 맞으면 auto-merge를 켠다 / large: 사용자가 직접 머지
- **조건이 깨지면 예약을 끈다:** 승인 후 등급을 large로 바꾸거나, `user-approved`를 떼거나, draft로 되돌리면 이미 켜진 auto-merge를 해제한다(`gh pr merge --disable-auto`). 같은 SHA에서 등급만 바뀌면 새 커밋이 없어 라벨 자동 해제가 안 걸리기 때문이다
- auto-merge는 처음부터 fine-grained PAT(`AUTOMERGE_TOKEN`)로 켠다. `GITHUB_TOKEN`으로 일으킨 머지는 production 배포 워크플로우를 깨우지 않고, auto-merge는 비동기로 머지돼서 `workflow_run`으로 우회하기도 어렵다

**neon(Gemini)** 은 로컬 Gemini CLI를 구글 계정 로그인(무료 한도)으로 쓴다. 과금되는 API 키나 GitHub Action은 쓰지 않는다.
기획 에이전트가 정해진 단계에서 Antigravity CLI(`agy -p`, 구글 로그인)로 비대화식 호출하고, 결과를 PR에 `neon review` 코멘트로 단다.
- 플랜 리뷰(001부터): draft PR을 올리거나 플랜을 고칠 때마다. 프롬프트 `.claude/prompts/neon-plan-review.md`
- 아트/UX 크리틱(002에서): 플레이테스트 스크린샷 평가. 프롬프트 `.claude/prompts/neon-art-critique.md`

## 역할
| 역할 | 모델 | 하는 일 | 사용자와 |
|---|---|---|---|
| 기획/디자인 | Opus 5.5 | 플랜 작성, 콘텐츠·UX 결정, 리뷰 반영, neon 호출 | **유일하게 직접 대화** |
| 개발 리드 | Opus 5.5 | `tasks.md` 작업 분할, 테스트 선작성, **개발 worktree 결과를 PR 브랜치로 모으는 책임**, 구현이 의도대로인지 판단 | — |
| 개발 | Sonnet 5.5 | 작업 단위 구현, 테스트 통과 | — |
| QA | Opus 5.5 | 플랜·명세 대비 검증, 버그 리포트 | 결과만 보고 |
| 플레이어 | Sonnet 5.5 ×3 | staging에서 사전 정보 없이 페르소나 관점으로 플레이 (002) | 결과만 보고 |
| 품질 감사(일일) | Opus 5.5 | 코드 품질 평가 리포트. **12/4까지 리포트만, PR 금지** (002) | 리포트만 |

- 개발 에이전트를 **병렬로** 돌릴 때만 작업마다 worktree를 따로 만든다. 순차 작업은 PR worktree 하나를 재사용한다(`npm ci` 반복 방지)

## 인수인계 형식 (전부 md)
템플릿은 `docs/templates/`, GitHub 쪽은 `.github/`에 둔다. 001에서 만드는 것:

| 산출물 | 위치 | 템플릿 | 쓰는 쪽 |
|---|---|---|---|
| 플랜 | `docs/plans/NNN-*.md` | `plan.md` — 등급·관련 이슈·마일스톤·Context·만들 것·하지 않는 것·Verification | 기획 |
| 작업 목록 | `docs/plans/NNN-tasks.md` | `tasks.md` — 작업별 담당·완료 조건·연결 테스트·상태 | 개발 리드 |
| QA 리포트 | `docs/plans/NNN-qa.md` | `qa-report.md` — 판정, 플랜 항목별 확인 결과, 반려 사유와 재현 방법 | QA |
| 회고 | `docs/retro.md` | 한 줄: `날짜 · PR · 문제 · 원인 · 규칙화 여부` | 기획 |
| PR 본문 | — | `.github/pull_request_template.md` — 등급·관련 이슈·마일스톤·플랜 링크·변경 요약·검증 결과·성능 예산·리뷰 기록 표·사용자 체크리스트(`<details>`) | 모두 |
| 이슈 | — | `.github/ISSUE_TEMPLATE/bug.yml`(재현·기대·실제·환경) + `config.yml`(빈 이슈 금지) | QA |

002에서 추가: 플레이테스트·품질 감사·페르소나 템플릿, `playtest`·`art-ux`·`quality` 이슈 템플릿.

**리뷰 출력 형식**(모든 리뷰어 공통): `판정(승인/수정 요청)` → `막는 문제` → `제안` → `질문`. 항목마다 근거 위치(파일·줄 또는 플랜 절).
Codex는 `AGENTS.md`의 `## Review guidelines`, neon은 프롬프트 파일, QA는 `qa-report.md`에 이 형식을 둔다.

에이전트끼리 대화는 공유하지 않는다. 위 파일만이 인수인계 수단이다.

## 규칙 (`AGENTS.md`에 들어갈 내용)

### 코드 컨벤션
- **기준: [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html).** `AGENTS.md`에는 링크와 이 프로젝트에서 다르게 하는 점만 적는다
- 도구로 강제: 포맷(Prettier), 린트(oxlint, typescript·react 규칙), `tsconfig` strict. CI에서 실패시킨다
- React·R3F 보충: 함수형 컴포넌트 + named export, 훅 규칙, `useFrame` 안에서 setState·객체 생성 금지, 지오메트리·머티리얼 재사용
- 브랜치 `feat|fix|chore/NNN-이름`, 커밋은 Conventional Commits

### 구조·소유권
- `scene/`은 그리기, `net/`은 통신, `ui/`는 패널. 메시지 타입은 `shared/protocol.ts` 한 곳
- 기지 상태의 주인은 서버(DO). 클라이언트는 상태를 직접 바꾸지 않고 요청만 보낸다
- 플랜에 없는 의존성은 추가하지 않는다

### 성능 예산 (유연하게)
- 잠정치: 데스크톱 60fps, 중급 폰 30fps 이상, 드로우콜 100 이하, 초기 JS 번들 gzip 600KB 이하
- 첫 이정표 뒤 실측 기준선으로 확정. 확정 전 CI는 경고만, 확정 후 번들 크기는 실패 처리
- 예산 초과 PR은 이유를 본문에 적으면 사용자 판단으로 통과 가능

### 에셋
- CC0 등 출처가 분명한 것만, `CREDITS.md`에 기록
- GLB는 Draco 압축 필수(`scripts/compress.sh`), 원본은 커밋하지 않는다

### 멈추고 사용자를 부르는 조건
작업을 멈추고 PR 코멘트 + herdr 알림으로 사용자를 부른다. 그다음은 사용자가 정한다.
- 같은 테스트를 세 번 고쳐도 실패
- 작업 범위가 플랜 밖으로 넓어짐
- 리뷰어 의견 충돌, 리뷰 3턴 초과
- 시크릿·배포 설정·DO 스키마·결제 관련 변경
- 되돌릴 수 없는 작업(데이터 삭제, force push, 프로덕션 롤백 등)

### 완료 기준 (Definition of Done)
- **small**: CI + pr-check 통과, Codex 리뷰, 사용자 `user-approved` → auto-merge
- **large**: 위 + 플랜 승인 + QA 통과 + (플레이 가능한 기능이 있는 PR이면) staging 플레이테스트 + 사용자 머지
- 플레이테스트·아트 평가는 **수리가 가능한 첫 기능 PR부터** 적용한다. 그 전 PR은 화면이 뜨고 연결되는지만 검증한다
- 공통: 테스트 대상(서버 로직·UI 로직)은 테스트가 있다, 성능 예산 확인 결과를 PR 본문에 적는다, 리뷰 기록 표가 채워져 있다

### 발견한 문제 쌓기
- QA 버그·플레이테스트 지적은 GitHub Issues로. 기획 에이전트가 묶고 우선순위 제안, 처리 여부는 사용자
- **이슈를 처리하는 PR은 본문에 이슈를 링크한다**(`Closes #N` / `Refs #N`). 없으면 `없음`이라고 쓴다. pr-check가 강제
- **모든 PR·이슈에 라벨과 마일스톤.** PR은 `size:*` 1개 + `stage:*` 1개 + 마일스톤 필수. pr-check가 강제. 단계 라벨은 에이전트가 단계를 넘길 때 바꾼다

### 시크릿·환경변수
- 로컬은 `.dev.vars`(gitignore), 필요한 키 목록은 `.dev.vars.example`
- CI는 GitHub Secrets. 시크릿 값은 문서·로그·PR에 남기지 않는다

### 배포
- PR Preview 또는 단일 `staging`. 단일 `staging`이면 `deploy.yml`에 `concurrency` 그룹을 걸어 동시 배포를 막고, `stage:playtest` PR은 한 번에 하나만
- 프로덕션 문제 시 `npx wrangler rollback`(사용자 승인 후). DO 스키마 변경이 낀 배포는 롤백 전 사용자와 확인

### 회고
- PR 머지 때마다 기획 에이전트가 `docs/retro.md`에 한 줄
- 같은 문제가 두 번 나오면 규칙화를 제안하고, 사용자가 승인하면 `AGENTS.md`에 추가한다. 예외 처리 규칙은 이렇게만 늘린다

## 만들 것 (001)
1. **앱 스캐폴드**
   - Vite + React + TypeScript + R3F + drei, Prettier, oxlint, Vitest, `.nvmrc`
   - 콘텐츠 계획의 추가 의존성(`zustand`, `@react-three/postprocessing`, `r3f-perf`, `maath`) 설치·빌드 호환성 확인. `r3f-perf` 충돌 시 대체 HUD로 기록
   - 화면은 큐브 하나
   - `.gitignore`: `.dev.vars`, `.wrangler/`, `playwright-report/`, `test-results/` 추가
2. **Worker 단일 배포**
   - `wrangler.jsonc`: static assets(dist, SPA fallback) + DO 바인딩 + SQLite migration. Preview를 쓰면 `previews` 블록에도 DO 바인딩 선언
   - `worker/index.ts` + `worker/BaseRoom.ts`: `/ws` 에코만 (Hibernation API). DO는 첫 접속 때 임의 `instanceId`를 storage에 한 번 저장하고 에코 응답에 함께 돌려준다 → Preview 격리 실측용 관측값
   - `@cloudflare/vitest-pool-workers`로 DO 테스트 1개(에코)
3. **규칙 문서** — 세 도구가 처음 읽는 파일이 다르다(Claude Code `CLAUDE.md`, Codex `AGENTS.md`, neon은 Antigravity CLI `agy` — 시작 시 `AGENTS.md`를 읽는 것 확인). **`AGENTS.md` 하나를 원본**으로 둔다
   - `AGENTS.md`: 한 단락 소개, 명령어, **먼저 읽을 문서**(`docs/content-plan.md` 작업 전 항상, `docs/spec.md`, 진행 중인 `docs/plans/NNN-*`, `docs/templates/`), 위 규칙 전부, 병렬 세션 규칙(메인 체크아웃 읽기 전용, 브랜치 작업은 worktree, 착수 전 브랜치 push로 클레임, 남의 브랜치·미커밋 변경 불가침, 인터페이스 기준 분할), `## Review guidelines`(공통 출력 형식 + 중점: 서버 상태 멱등성, 테스트 유무, 범위 이탈, 모바일 성능)
   - `CLAUDE.md`: `@AGENTS.md` 임포트 + Claude 전용(서브에이전트 구성, 역할별 에이전트, neon 호출 절차). 현재 초안의 옛 계획서 경로·머지 규칙은 이 내용으로 대체
   - `GEMINI.md`: `@AGENTS.md` 임포트 + neon 역할 한 단락(리뷰만, 코드 수정 금지). Gemini 계열 도구용 보조 파일
   - `.claude/agents/`: `planner.md` `dev-lead.md` `dev.md` `qa.md` (모델·도구 권한, 역할별 읽을 문서와 산출물만. 공통 규칙 반복 안 함). 개발은 병렬일 때 `isolation: worktree`
   - 역할별 스킬: 기획 `minimal-ui`(HUD·패널), QA `/code-review medium`, 마일스톤마다 `doc-lint`
   - `.claude/prompts/neon-plan-review.md`
   - `docs/templates/`: plan, tasks, qa-report / `docs/retro.md` / `CREDITS.md` / `.dev.vars.example`
   - `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/bug.yml`, `config.yml`
4. **GitHub**
   - `ci.yml`: clean checkout에서 `npm ci` → `format:check` → lint → typecheck → test → build. 전부 필수, `--if-present`·lockfile 유무 생략 없음. Node는 `node-version-file: .nvmrc`
   - `pr-check.yml`: 트리거 `pull_request: [opened, edited, synchronize, reopened, labeled, unlabeled, milestoned, demilestoned, ready_for_review, converted_to_draft]`
     - `관련 이슈` 칸(`Closes/Refs #N` 또는 `없음`), `size:*`·`stage:*` 라벨, 마일스톤 검사
     - `user-approval` 잡: **잡 레벨 `if:`를 쓰지 않고 항상 실행**한다(건너뛴 필수 체크는 통과로 간주되기 때문). 한 잡 안에서 순서대로 처리한다
       1. `synchronize`이고 `user-approved`가 붙어 있으면 → 라벨 제거 + 코멘트 + 즉시 실패. (`GITHUB_TOKEN`이 뗀 라벨은 `unlabeled` 이벤트를 다시 일으키지 않으므로, 이벤트 스냅샷을 믿지 않고 여기서 끝낸다)
       2. 그 외에는 API로 현재 라벨을 다시 읽어 `user-approved`가 없으면 실패
     - auto-merge 잡: `needs: [user-approval]` + `if: always()`로 승인 잡 **뒤에** 돈다(병렬이면 라벨 제거 전 상태를 볼 수 있다)
       - `synchronize`면 무조건 승인 해제 상태로 본다
       - `size:small + user-approved + ready(draft 아님)`면 `AUTOMERGE_TOKEN`으로 `gh pr merge --auto --squash`
       - 조건이 하나라도 깨졌고 PR의 `autoMergeRequest`가 실제로 켜져 있을 때만 `--disable-auto`(꺼진 PR에 호출하면 오류)
   - `deploy.yml`: PR → Preview(또는 staging, `concurrency` 그룹), main → production
   - 라벨(만들어 둠): `size:*` `stage:*` `plan-approved` `bug` `playtest` `art-ux` `quality` + **`user-approved` 추가**
   - 마일스톤(만들어 둠): M0 하네스 ~ M5 출시
   - 브랜치 보호: 필수 체크 `ci` `pr-check` `user-approval`, Approve 필수 끔, auto-merge 허용
5. **핵심 훅** (`.claude/settings.json`)
   - main에서 커밋·push, force push 차단
   - 메인 체크아웃에서 브랜치 전환 차단: `git rev-parse --git-dir`과 `--git-common-dir`이 같을 때(=메인 체크아웃)만 막는다. worktree 안에서는 허용
   - `.dev.vars`·시크릿 파일 커밋 차단
   - 에이전트가 `user-approved` 라벨을 다는 명령 차단
   - 사용자 호출·턴 종료 시 herdr 알림

## 002로 넘기는 것 (다음 PR, 정식 체인으로)
- `scripts/playtest.sh`와 플레이어 격리 실행: 전용 빈 폴더(`${PLAYER_SANDBOX_DIR:-~/projects/money/player-sandbox}`, 이미 만들어 둠), 실행 전 그 폴더 몫 Claude 메모리 비우기, `--tools ""` + `--strict-mcp-config`로 Playwright MCP만 + `--allowedTools "mcp__playwright__*"`, Playwright `--isolated`, 페르소나만 주입, 폰 페르소나는 모바일 뷰포트(390×844·터치), 스크린샷 `--output-dir` → `docs/playtests/` 수거 → neon 아트 크리틱, headless WebGL이 검은 화면이 아닌지 확인, `--bare`는 과금이라 안 씀
- 페르소나 3종(폰 캐주얼 게이머 / 3D·웹 관심 PC 개발자 / 게임 거의 안 하는 첫 방문자), `.mcp.json`, `player.md` 에이전트
- 프로젝트 스킬 `start-task` `playtest` `retro`
- SessionStart 요약 훅, 상태줄
- 품질 감사 에이전트(`/simplify` 기준 리포트), 예약 실행은 `/schedule`로 첫 이정표 뒤
- 템플릿: playtest, audit, persona / 이슈 템플릿 playtest, art-ux, quality / `neon-art-critique.md`

## 사용자가 해야 할 것 (그때 알림)
- Cloudflare API 토큰 → GitHub 시크릿 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- 로컬 `npx wrangler login`
- Antigravity CLI(`agy`) 설치·구글 로그인 (완료)
- 레포에 Codex 웹 리뷰 연결
- auto-merge용 fine-grained PAT(이 레포만, Contents·Pull requests 쓰기) → 시크릿 `AUTOMERGE_TOKEN`
- 브랜치 보호: gh로 제가 걸 수 있으면 걸고 결과를 보여준다

## 세팅하면서 확인할 것
- Worker Previews의 DO 격리 실측: 같은 방 이름으로 Preview A에 재접속하면 같은 `instanceId`, Preview B에서는 다른 값인지. 되면 PR Preview, 안 되면 단일 `staging`
- herdr 알림을 훅과 연결하는 방법
- 최신 스택(React 19.3 / R3F 9.8 / drei 10.7 / three 0.187 / Vite 8 / TS 7)과 추가 패키지 호환
- `agy`: 규칙 자동 로드(확인됨), 헤드리스에서 명령 실행 권한이 없어 플랜을 프롬프트에 넣고 도구 없이 리뷰(확인됨)

## 하지 않는 것
- 콘텐츠 기능 구현
- 002 항목 전부(위)
- 일정 확인, 비용·한도 관리(사용자가 직접)
- Workflow(다중 에이전트 오케스트레이션) — 첫 기능 PR에서 시도 여부를 정한다
- 멈춘 뒤의 대체 경로(사용자가 나중에 결정)

## Verification

### 001 안에서 (머지 전)
- 로컬: `npm ci && npm run format:check && npm run lint && npm run typecheck && npm test && npm run build` 통과
- `wrangler dev`에서 큐브가 보이고 `/ws` 에코 왕복
- CI가 실제로 실패를 잡는다: 실패하는 테스트 하나를 넣은 커밋 → 필수 체크 빨간색 → 복구하면 녹색. 포맷 위반도 같은 방식으로 확인
- pr-check: `관련 이슈` 칸 비우기 / `size:*` 빼기 / 마일스톤 빼기 → 각각 실패, 라벨·본문만 고쳐도 재실행되어 통과
- 승인: `user-approved`를 단 뒤 새 커밋을 push → 라벨이 자동으로 떨어지고 `user-approval` 체크가 빨간색으로 남는다(녹색으로 남지 않는다)
- Preview(또는 staging) URL에서 큐브가 보이고 WS 에코 왕복. 격리 실측 결과(`instanceId` 비교, 또는 실제로 검증한 범위)를 PR에 기록
- 훅: main 커밋, 메인 체크아웃 브랜치 전환, `.dev.vars` 커밋, 에이전트의 `user-approved` 부착이 각각 막히고, worktree 안의 브랜치 작업은 막히지 않는다
- 세 도구에 "이 프로젝트 규칙과 먼저 읽을 문서가 뭐야?" → 같은 답
- `agy -p`로 이 플랜 리뷰 → PR에 `neon review` 코멘트, 리뷰 기록 표에 SHA와 함께 기록

### 001 머지 후 (새 워크플로우가 main에 들어간 뒤에만 가능)
1. 머지 직후 production URL에서 큐브와 WS 에코 확인
2. **첫 실제 small PR**(더미 아님, 예: `README.md`·`CREDITS.md` 보완)로 검증하고 결과를 그 PR에 남긴다
   - `user-approved` → auto-merge 예약 → 머지 → 그 main 커밋으로 production 배포 워크플로우가 실제로 돈다
   - draft 전환: 승인된 small을 CI 대기 중에 draft로 돌리면 예약이 꺼진다
   - 등급 전환: 승인된 small을 CI 대기 중에 large로 바꾸면 예약이 해제되고, CI가 통과해도 PR이 열린 채로 남는다(이 확인은 같은 PR을 먼저 large로 바꿔 검증한 뒤 small로 되돌려 머지)
