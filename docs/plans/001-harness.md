# 001 — 하네스·개발환경 세팅

- 브랜치: `chore/harness-setup`
- 등급: **large** (사용자 머지)
- 상태: 플랜 리뷰 중

## Context
OUTPOST(`docs/content-plan.md`)를 만들기 전에, 실제 팀처럼 PR 단위로 굴러가는 개발 프로세스를 먼저 세운다.
이 프로젝트 규모에는 무거운 구성이지만, 프로세스를 직접 운영해 보는 게 목적 중 하나다.
레포는 공개이고, 플랜·리뷰·플레이테스트 기록이 남는 것 자체를 보여준다.

**부트스트랩 예외:** 이 PR은 리뷰 자동화가 들어가기 전이라 정식 체인을 다 타지 못한다.
플랜 리뷰는 로컬 Codex CLI(`codex exec`)와 사용자 리뷰로 하고, 코드 리뷰는 웹 Codex(`@codex review`)와 사용자 리뷰로 한다.

## 워크플로우 (이 PR이 문서화·자동화할 대상)
```
브랜치 생성 → docs/plans/NNN-*.md 작성 → draft PR
  → 플랜 리뷰: Codex(웹) + neon(Gemini) → 사용자   (최대 3턴, 결론은 사용자가 냄)
  → 승인(plan-approved 라벨)
  → 개발 리드(Opus): 작업 분할(tasks.md) + 테스트 먼저 작성 (서버 로직·UI 로직만)
  → 개발(Sonnet): 구현
  → QA(Opus): 명세 대비 검증, 실패 시 개발로 반려
  → staging 배포 → 플레이어 페르소나 에이전트들이 플레이테스트 + neon이 스크린샷으로 아트/UX 크리틱
  → PR ready → 코드 리뷰: Codex(웹, PR 생성 시 + `@codex review`) → 사용자
  → 사용자 "리뷰 끝났어" → 반영 → CI 통과
  → small: 자동 머지 / large: 사용자 머지 → main 머지 시 production 자동 배포
```
**neon(Gemini)** 은 로컬 Gemini CLI를 구글 계정 로그인(무료 한도)으로 쓴다. 과금되는 API 키나 GitHub Action은 쓰지 않는다.
기획 에이전트가 정해진 단계에서 `gemini -p`로 비대화식 호출하고, 결과를 PR에 `neon review` 코멘트로 단다.
- 플랜 리뷰: draft PR을 올리거나 플랜을 고칠 때마다 플랜 문서를 넘긴다
- 아트/UX 크리틱: 플레이테스트 스크린샷을 넘겨 화면 구성·색·가독성·연출을 평가한다
- 프롬프트는 `.claude/prompts/neon-plan-review.md`, `.claude/prompts/neon-art-critique.md`로 고정한다
- 무료 한도를 넘기거나 CLI가 실패하면 그 단계는 건너뛰고 PR에 건너뛰었다고 남긴다(체인을 막지 않는다)

## 역할
| 역할 | 모델 | 하는 일 | 사용자와 |
|---|---|---|---|
| 기획/디자인 | Opus 5.5 | 플랜 작성, 콘텐츠·UX 결정, 리뷰 반영 | **유일하게 직접 대화** |
| 개발 리드 | Opus 5.5 | `tasks.md` 작업 분할, 테스트 선작성, 구현이 의도대로인지 판단 | — |
| 개발 | Sonnet 5.5 | 작업 단위 구현, 테스트 통과 | — |
| QA | Opus 5.5 | 플랜·명세 대비 검증, 버그 리포트 | 결과만 보고 |
| 플레이어 | Sonnet 5.5 ×3 | staging에서 사전 정보 없이 페르소나 관점으로 플레이, 리포트 | 결과만 보고 |
| 품질 감사(일일) | Opus 5.5 | 코드 품질 평가 리포트. **12/4까지 리포트만, PR 금지** | 리포트만 |

플레이어 페르소나(초안): ① 출퇴근길 폰으로 링크 하나 눌러본 캐주얼 게이머 ② 3D/웹에 관심 있는 PC 개발자 ③ 게임 거의 안 하는 첫 방문자.
플레이어 에이전트는 레포·플랜을 **읽지 않는다**. staging URL과 페르소나 설명만 받는다.
서브에이전트로 띄우면 `CLAUDE.md`를 통해 정보가 샐 수 있어서, 별도 프로세스로 띄운다(`scripts/playtest.sh`):
- 레포 밖 전용 빈 폴더 `~/projects/money/player-sandbox/`에서 `claude -p` 실행 → 프로젝트 `CLAUDE.md`·`AGENTS.md`가 없다. 이 폴더에는 아무 파일도 두지 않는다
- 실행 전마다 이 폴더 몫의 Claude 프로젝트 메모리(`~/.claude/projects/<이 폴더>/memory/`)를 비운다 → 이전 플레이테스트 기억이 다음 플레이어에게 넘어가지 않는다
- `--tools ""`(파일·셸 도구 없음) + `--strict-mcp-config --mcp-config`로 **Playwright MCP만** → 브라우저 말고는 아무것도 못 본다
- Playwright는 `--isolated` 프로필 → 쿠키·기록 없는 첫 방문 브라우저
- `--append-system-prompt-file`로 페르소나만 주입(`docs/personas/*.md`, 사람 설명만 쓰고 게임 정보는 쓰지 않는다)
- 리포트는 stdout으로 받아 기획 에이전트가 `docs/playtests/`에 저장
- `--bare`는 API 키 과금이라 쓰지 않는다

## 인수인계 형식 (전부 md)
- `docs/plans/NNN-*.md` — 플랜 (`docs/templates/plan.md`)
- `docs/plans/NNN-tasks.md` — 작업 목록·담당·완료 조건 (`docs/templates/tasks.md`)
- 테스트 파일 — 완료 조건의 실행 가능한 형태
- `docs/playtests/NNN-<persona>.md` — 플레이테스트 리포트 (`docs/templates/playtest.md`)
- `.github/pull_request_template.md` — 등급·플랜 링크·검증 결과·플레이테스트 요약
- 에이전트끼리 대화는 공유하지 않는다. 위 파일만이 인수인계 수단이다.

## 규칙 (`AGENTS.md`에 들어갈 내용)

### 코드 컨벤션
- **기준: [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html).** TS 전용으로 쓰여 있고 구글이 계속 관리한다. Airbnb 가이드가 더 널리 알려져 있지만 JS 시절 문서라 TS 규칙은 따로 보충해야 하고 분량도 길다
- 가이드 전문을 옮기지 않는다. `AGENTS.md`에는 링크와 **이 프로젝트에서 다르게 하는 점**만 적는다
- 도구로 강제할 수 있는 건 도구로: 포맷(Prettier), 린트(oxlint, typescript·react 규칙), `tsconfig` strict. CI에서 실패시킨다
- React·R3F는 가이드가 다루지 않으므로 몇 줄 보충: 컴포넌트는 함수형+named export, 훅 규칙, `useFrame` 안에서 setState·객체 생성 금지, 지오메트리·머티리얼 재사용
- 브랜치 `feat|fix|chore/NNN-이름`, 커밋은 Conventional Commits

### 구조·소유권
- `scene/`은 그리기, `net/`은 통신, `ui/`는 패널. 메시지 타입은 `shared/protocol.ts` 한 곳
- 기지 상태의 주인은 서버(DO). 클라이언트는 상태를 직접 바꾸지 않고 요청만 보낸다
- 플랜에 없는 의존성은 추가하지 않는다

### 성능 예산 (유연하게)
- 처음엔 **잠정치**로 시작한다: 데스크톱 60fps, 중급 폰 30fps 이상, 드로우콜 100 이하, 초기 JS 번들 gzip 600KB 이하
- 첫 이정표 뒤 실측 기준선을 재고 그걸 바탕으로 확정한다. 확정 전까지 CI는 **경고만**, 확정 후 번들 크기는 CI에서 실패 처리
- 예산을 넘기는 PR은 이유를 PR 본문에 적으면 통과 가능(사용자 판단)

### 에셋
- CC0 등 출처가 분명한 것만. 출처·라이선스는 `CREDITS.md`
- GLB는 Draco 압축 필수(`scripts/compress.sh`), 원본은 커밋하지 않는다

### 멈추고 사용자를 부르는 조건
아래 중 하나면 작업을 멈추고 PR 코멘트 + herdr 알림으로 사용자를 부른다. 멈춘 뒤 어떻게 할지(대체 경로 등)는 사용자가 정한다.
- 같은 테스트를 세 번 고쳐도 실패
- 작업 중 범위가 플랜 밖으로 넓어짐
- 리뷰어 의견 충돌, 리뷰 3턴 초과
- 시크릿·배포 설정·DO 스키마·결제 관련 변경
- 되돌릴 수 없는 작업(데이터 삭제, force push, 프로덕션 롤백 등)

### 완료 기준 (Definition of Done)
- **small**: CI 통과 + Codex 리뷰 + 사용자 리뷰 → 자동 머지
- **large**: 위 + 플랜 승인 + QA 통과 + staging 플레이테스트(페르소나 3종 + neon 아트/UX) + 사용자 머지
- 공통: 테스트 대상(서버 로직·UI 로직)은 테스트가 있다, 성능 예산 확인 결과를 PR 본문에 적는다

### 발견한 문제 쌓기
- QA 버그·플레이테스트 지적은 GitHub Issues로 올린다. 라벨 `bug` `playtest` `art-ux` + 출처 페르소나
- 기획 에이전트가 묶고 우선순위 제안, 처리 여부는 사용자가 정한다

### 시크릿·환경변수
- 로컬은 `.dev.vars`(gitignore), 필요한 키 목록은 `.dev.vars.example`
- CI는 GitHub Secrets. 시크릿 값은 문서·로그·PR에 남기지 않는다

### 배포 롤백
- 프로덕션 문제 시 `npx wrangler rollback`으로 직전 버전 복구(사용자 승인 후). DO 스키마 변경이 낀 배포는 롤백 전 사용자와 확인

### 회고
- PR 머지 때마다 기획 에이전트가 `docs/retro.md`에 "이번에 터진 문제" 한 줄을 남긴다
- 같은 문제가 두 번 나오면 규칙으로 올리자고 제안하고, 사용자가 승인하면 `AGENTS.md`에 추가한다. 예외 처리 규칙은 이렇게만 늘린다

## 만들 것
1. **앱 스캐폴드 (새로)**
   - Vite + React + TypeScript + R3F + drei, oxlint, Vitest
   - 콘텐츠 계획의 추가 의존성(`zustand`, `@react-three/postprocessing`, `r3f-perf`, `maath`) 설치·빌드 호환성 확인. `r3f-perf` 충돌 시 대체 HUD로 기록
   - 화면은 큐브 하나
2. **Worker 단일 배포**
   - `wrangler.jsonc`: static assets(dist, SPA fallback) + Durable Object 바인딩 + SQLite migration
   - `worker/index.ts` + `worker/BaseRoom.ts`: `/ws` 에코만 (Hibernation API)
   - `@cloudflare/vitest-pool-workers`로 DO 테스트 1개(에코)
3. **하네스 문서**
   세 도구가 이 폴더에서 처음 읽는 파일이 다르다: Claude Code는 `CLAUDE.md`, Codex는 `AGENTS.md`, Gemini CLI는 `GEMINI.md`.
   규칙이 세 군데로 갈라지지 않도록 **`AGENTS.md` 하나를 원본**으로 두고 나머지는 그걸 가리킨다.
   - `AGENTS.md` (원본, 모든 에이전트 공통)
     - 프로젝트 한 단락 소개, 명령어
     - **먼저 읽을 문서** 목록과 언제 읽는지: `docs/content-plan.md`(콘텐츠·범위, 작업 전 항상), `docs/spec.md`(기술 목록), 진행 중인 `docs/plans/NNN-*.md`·`NNN-tasks.md`(맡은 작업), `docs/templates/`(산출물 쓸 때)
     - 범위 고정 사항, 워크플로우, 브랜치·플랜 우선 규칙, PR 등급별 머지 규칙, 리뷰 최대 3턴, TDD 범위, 큰 변경(DO 스키마·배포 설정) 사용자 승인, 품질 감사 리포트 전용 규칙, 인수인계 형식
     - **병렬 세션 규칙**: 메인 체크아웃 읽기 전용, 브랜치 작업은 전용 worktree, 착수 전 브랜치 push로 클레임, 남의 브랜치·미커밋 변경 불가침, 인터페이스 기준 분할
     - `## Review guidelines`: Codex 웹 리뷰가 읽는 절. 중점(서버 상태 멱등성, 테스트 유무, 범위 이탈, 모바일 성능)
   - `CLAUDE.md`: `@AGENTS.md` 임포트 + Claude 전용 내용만(서브에이전트 구성, 역할별로 어떤 에이전트를 쓰는지, neon 호출 절차)
   - `GEMINI.md`: `@AGENTS.md` 임포트 + neon 역할 한 단락(리뷰어로서 무엇을 보는지, 코드 수정 금지). 임포트가 안 되면 `.gemini/settings.json`에서 컨텍스트 파일을 `AGENTS.md`로 지정
   - `.claude/agents/`: `planner.md` `dev-lead.md` `dev.md` `qa.md` `player.md` `quality-auditor.md` (모델·도구 권한 지정). 각 파일은 공통 규칙을 반복하지 않고 역할별 읽을 문서와 산출물만 적는다. `player.md`만 예외로 레포 문서를 읽지 않는다
   - `.claude/prompts/`: `neon-plan-review.md`, `neon-art-critique.md`
   - `.mcp.json`: Playwright MCP (플레이어·QA용)
   - `docs/templates/`: plan, tasks, playtest
   - `docs/personas/`: 페르소나 3종, `scripts/playtest.sh`
4. **GitHub**
   - `.github/workflows/ci.yml`: lint · typecheck · test · build (PR·main). Node 버전은 `.nvmrc`로 로컬과 맞춘다
   - `.github/workflows/deploy.yml`: PR → staging, main 머지 → production
   - 라벨: 등급 `size:small` `size:large` / 단계 `stage:plan-review` `stage:dev` `stage:qa` `stage:playtest` `stage:code-review` / 승인 `plan-approved` / 이슈 `bug` `playtest` `art-ux`. 단계 라벨은 에이전트가 단계 넘어갈 때 바꾼다 → GitHub만 봐도 누구 차례인지 보인다
   - 브랜치 보호(main): CI 필수 + 사용자 승인 필수, auto-merge 허용 → `size:small`이면 auto-merge 켜는 워크플로우
   - Codex 웹 리뷰 연결: 사용자가 기존 방식대로 설정
5. **훅으로 규칙 강제** (`.claude/settings.json`, 커밋되는 프로젝트 설정)
   - main 브랜치에서 커밋·push, force push 차단
   - 메인 체크아웃에서 브랜치 전환 차단(worktree 규칙)
   - `.dev.vars`·시크릿 파일 커밋 차단
   - 에이전트 턴 종료·사용자 호출 시 herdr 알림
6. **포맷·린트 설정**: Prettier, oxlint(typescript·react), `tsconfig` strict, `.nvmrc`
7. **나머지 파일**: `CREDITS.md`, `.dev.vars.example`, `docs/retro.md`
8. **품질 감사 에이전트**: 역할 정의와 규칙만. 예약 실행은 첫 이정표 뒤에.

## 사용자가 해야 할 것 (그때 알림)
- Cloudflare API 토큰 발급 → GitHub 시크릿 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- 로컬 `npx wrangler login`
- Gemini CLI 설치 후 `gemini`를 한 번 실행해 구글 계정으로 로그인
- 레포에 Codex 웹 리뷰 연결
- 브랜치 보호 설정 확인(gh로 제가 걸 수 있으면 걸고, 결과를 보여줌)

## 세팅하면서 확인할 것
- Worker Previews(2026-09)가 DO를 PR별로 분리해 주는지 → 되면 PR별 staging, 안 되면 `staging` 환경 1개
- herdr 알림을 에이전트 턴 종료와 연결할 수 있는지
- 최신 스택(React 19.3 / R3F 9.8 / drei 10.7 / three 0.187 / Vite 8 / TS 7)과 추가 패키지 호환
- Gemini CLI가 `GEMINI.md`의 `@` 임포트를 지원하는지, 구글 로그인 무료 한도가 지금도 있는지, 비대화식(`-p`)에서 이미지 입력이 되는지

## 하지 않는 것
- 콘텐츠 기능 구현(다음 PR부터)
- 품질 감사 예약 실행
- 일정 확인, 비용·한도 관리(사용자가 직접)
- 멈춘 뒤의 대체 경로(사용자가 나중에 결정)


## Verification
- `npm run lint && npm run typecheck && npm test && npm run build` 로컬 통과
- `wrangler dev`에서 큐브 페이지 + `/ws` 에코 동작
- 이 PR에서 CI 녹색, staging 배포 URL이 열리고 WS 에코 동작
- main 머지 후 production URL 동작
- 테스트용 `size:small` 더미 PR로 auto-merge 동작 확인 후 닫기
- 훅 확인: main에서 커밋 시도, 메인 체크아웃에서 브랜치 전환 시도, `.dev.vars` 커밋 시도가 각각 막힌다
- 포맷·린트 위반 코드를 넣은 커밋에서 CI가 실패한다
- `scripts/playtest.sh`로 띄운 플레이어에게 "이 게임 이름과 계획을 아는 대로 말해봐"라고 물으면 모른다고 답한다(정보 차단 확인), 두 번째 실행에서도 첫 실행 내용을 모른다
- 세 도구에서 "이 프로젝트 규칙과 먼저 읽을 문서가 뭐야?"라고 물으면 같은 답이 나온다
- `gemini -p`로 이 플랜을 리뷰시켜 PR에 `neon review` 코멘트가 달린다
- Claude Code에서 `.claude/agents/*` 6종이 인식되고, Playwright MCP로 staging URL 스크린샷 1장 확보
