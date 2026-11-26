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
- 레포 밖 빈 임시 폴더에서 `claude -p` 실행 → 프로젝트 `CLAUDE.md`·`AGENTS.md`·프로젝트 메모리가 없다
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
   - 라벨: `size:small` `size:large` `plan-approved`
   - 브랜치 보호(main): CI 필수 + 사용자 승인 필수, auto-merge 허용 → `size:small`이면 auto-merge 켜는 워크플로우
   - Codex 웹 리뷰 연결: 사용자가 기존 방식대로 설정
5. **품질 감사 에이전트**: 역할 정의와 규칙만. 예약 실행은 첫 이정표 뒤에.

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


## Verification
- `npm run lint && npm run typecheck && npm test && npm run build` 로컬 통과
- `wrangler dev`에서 큐브 페이지 + `/ws` 에코 동작
- 이 PR에서 CI 녹색, staging 배포 URL이 열리고 WS 에코 동작
- main 머지 후 production URL 동작
- 테스트용 `size:small` 더미 PR로 auto-merge 동작 확인 후 닫기
- `scripts/playtest.sh`로 띄운 플레이어에게 "이 게임 이름과 계획을 아는 대로 말해봐"라고 물으면 모른다고 답한다(정보 차단 확인)
- 세 도구에서 "이 프로젝트 규칙과 먼저 읽을 문서가 뭐야?"라고 물으면 같은 답이 나온다
- `gemini -p`로 이 플랜을 리뷰시켜 PR에 `neon review` 코멘트가 달린다
- Claude Code에서 `.claude/agents/*` 6종이 인식되고, Playwright MCP로 staging URL 스크린샷 1장 확보
