# 001 — 작업 목록

플랜: `docs/plans/001-harness.md`. 작업끼리 파일이 겹치지 않게 나눴다. 공유 인터페이스는 아래 "약속"만 따른다.

## 약속 (모든 작업 공통)

- npm 스크립트 이름: `dev` `build` `preview` `format` `format:check` `lint` `typecheck` `test` `test:worker` `deploy` `deploy:preview`
- Node: `.nvmrc` = `26`
- Worker 이름 `outpost`, DO 클래스 `BaseRoom`, 바인딩 `BASE_ROOM`, WS 경로 `/ws`
- 라벨: `size:small` `size:large` `stage:plan-review` `stage:dev` `stage:qa` `stage:playtest` `stage:code-review` `plan-approved` `user-approved` `bug` `playtest` `art-ux` `quality`
- 시크릿: `CLOUDFLARE_API_TOKEN` `CLOUDFLARE_ACCOUNT_ID` `AUTOMERGE_TOKEN`
- 문서·커밋·UI는 작품 자체로 설명한다. 만든 목적이나 용도는 적지 않는다

## 작업

| #   | 작업                                  | 담당               | 파일                                                                                                                                                                                                                           | 완료 조건                                                                                                                                                             | 상태 |
| --- | ------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A   | 앱 스캐폴드 + Worker/DO 에코 + 테스트 | 개발 리드          | `package.json` `tsconfig*` `vite.config.ts` `index.html` `src/` `worker/` `shared/` `wrangler.jsonc` `.nvmrc` `.prettierrc*` `.oxlintrc.json` `.gitignore` `vitest*.config.ts`                                                 | 로컬 `npm ci && npm run format:check && npm run lint && npm run typecheck && npm test && npm run build` 통과, `wrangler dev`에서 큐브 + `/ws` 에코(`instanceId` 포함) | 완료 (`wrangler dev` 확인) |
| B   | 규칙 문서·에이전트·템플릿             | 개발(Sonnet)       | `AGENTS.md` `CLAUDE.md` `GEMINI.md` `.claude/agents/*` `.claude/prompts/neon-plan-review.md` `docs/templates/*` `docs/retro.md` `CREDITS.md` `.dev.vars.example` `.github/pull_request_template.md` `.github/ISSUE_TEMPLATE/*` | 플랜 "만들 것 3"과 "규칙" 절의 내용이 빠짐없이 들어감, 공통 규칙은 `AGENTS.md`에만                                                                                    | 완료 (리뷰 반영) |
| C   | GitHub 워크플로우                     | 개발(Sonnet)       | `.github/workflows/ci.yml` `pr-check.yml` `deploy.yml`                                                                                                                                                                         | 플랜 "만들 것 4"의 조건 전부(트리거 목록, `user-approval` 직렬 처리·잡 레벨 `if:` 금지, auto-merge 잡 순서·해제 조건, deploy `concurrency`), `actionlint` 통과        | 완료 (리뷰 반영) |
| D   | 핵심 훅                               | 개발 리드          | `.claude/settings.json` `scripts/hooks/*`                                                                                                                                                                                      | 플랜 "만들 것 5"의 차단 4종이 실제로 막히고 worktree 작업은 안 막힘                                                                                                   | 완료 (리뷰 반영) |
| E   | GitHub 설정·배포·검증                 | 개발 리드 + 사용자 | 브랜치 보호, 시크릿                                                                                                                                                                                                            | 플랜 Verification "001 안에서" 전부                                                                                                                                   | 대기 |
