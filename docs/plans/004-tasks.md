# 004 — 작업 목록

플랜: `docs/plans/004-playtest.md`. 작업끼리 파일이 겹치지 않게 나눈다. 경계는 인터페이스로 긋는다.

T1·T2는 한 개발 에이전트가 순서대로 한다(T2가 T1을 부른다). T3~T5는 문서라 같은 PR worktree에서 이어서 한다. 병렬로 돌릴 이유가 없으므로 worktree는 하나만 쓴다.

| #   | 작업                                | 담당 | 파일                                                                                     | 완료 조건                                                                                                                         | 연결 테스트                                                 | 상태 |
| --- | ----------------------------------- | ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---- |
| T0  | 사전 확인(플랜 0번 + neon 5턴 a)    | 리드 | —                                                                                        | 아래 "T0 결과". 하나라도 안 되면 멈춤                                                                                             | —                                                           | 완료 |
| T1  | 실행기 순수 로직                    | 개발 | `scripts/playtest-lib.mjs`(함수 본문만. 상수는 리드가 확정)                              | 연결 테스트 통과. 아래 "T1 세부". I/O 없음                                                                                        | `scripts/playtest-lib.test.mjs`                             | 완료 |
| T2  | 실행기 본체·진입점                  | 개발 | `scripts/playtest.mjs`, `scripts/playtest.sh`                                            | 연결 테스트 통과, `npm run test:hooks`·`lint`·`format:check` 통과. 아래 "T2 세부"                                                 | `scripts/playtest.test.mjs`(가짜 claude: `scripts/testdata/playtest/`) | 완료 |
| T3  | 페르소나 3종·리포트 템플릿          | 개발 | `docs/playtests/personas/{phone-casual,pc-dev,first-visitor}.md`, `docs/templates/playtest.md` | 첫 줄 `device: …`(T1 `readDevice` 형식). 작품 정보·원칙의 말 없음. 템플릿은 플랜 3번 항목 그대로, 질문은 중립                    | (T2 테스트가 형식만 본다. 내용은 M에서 확인)                | 완료 |
| T4  | 스킬 `playtest`                     | 개발 | `.claude/skills/playtest/SKILL.md`                                                       | 플랜 4번 절차 전부. 실행 명령은 `scripts/playtest.sh <Preview URL>`. 결과 폴더 경로·실행 모드·시간·토큰을 요약 코멘트에 옮기는 법 | —                                                           | 완료 |
| T5  | 규칙 문서                           | 개발 | `AGENTS.md`, `CLAUDE.md`                                                                 | 플랜 5·6번. AGENTS.md의 "#23 미구현" 문구 정리                                                                                    | —                                                           | 완료 |
| M   | 병합·의도 확인                      | 리드 | —                                                                                        | 아래 "M 확인"                                                                                                                     | 전체                                                        | 대기 |

## T0 결과 (2026-11-27, 로컬 `npm run build` + `npx wrangler dev`, `claude` 2.1.332, Sonnet)

`claude -p` 호출은 7번(인증 확인 1번은 토큰 0, Chrome 채널 실패 1번, init 직후 종료 1번 포함). 끝난 뒤 wrangler·Chromium 프로세스, 임시 폴더, `~/.claude/projects/` 아래 생긴 빈 폴더를 정리했다.

| 확인 항목 | 결과 | 확정 |
| --- | --- | --- |
| 스크린샷 보고 좌표로 큐브 클릭 | 됨. PC (640,335), 폰 (195,280)에서 패널이 열림 | — |
| 수리 버튼 홀드 | 됨. `mouse_move_xy` → `mouse_down` → `wait_for(2)` → `mouse_up`으로 수리 완료, 누적 1회 | 홀드 전에 `mouse_move_xy`가 필요하다(`mouse_down`은 좌표가 없다) |
| WebGL 장면이 스크린샷에 그려짐 | 됨(SwiftShader 기본값, Chromium 플래그 없음) | — |
| `--device "iPhone 13"` | 됨. 스크린샷은 `scale: css`로 390x664, 좌표도 CSS 픽셀이라 어긋나지 않음 | **기기 대체 안 함**(DPR 1 대체 불필요) |
| `--allowed-origins`에서 WebSocket·정적 리소스 | 됨. HUD `연결됨`. 다른 오리진 이동은 `ERR_BLOCKED_BY_CLIENT`. 지금 빌드엔 GLB·Draco가 없어 JS·CSS만 확인 | — |
| 스크린샷 파일 이름 | 결과 글에 `page-<ISO 시각>.png`로 나온다. **`filename` 인자를 주면 이미지가 모델에 안 돌아온다**(파일만 저장) | `filename` 쓰지 않음. 프롬프트에서 금지 |
| 3명 동시 | 됨. PC 1 + iPhone 2를 동시에, 각 18~25초, 시간 초과 없음. 화면에 `지금 접속 3명`, 수리는 한 번만 반영 | **시차 불필요**(기본 `PLAYTEST_STAGGER_SEC=0`) |
| 부모 `CLAUDE*` 환경 변수 비우고 실행 | 됨(Node에서 env를 걸러 spawn) | — |
| `--bare` | 안 됨. 로그인 인증을 읽지 않아 `api_error`(토큰 0) | **`--setting-sources ""`로 확정**, `--bare` 쓰지 않음 |
| init에 사용자 훅·메모리·플러그인 | 섞이지 않음. `skills`·`slash_commands` 빈 배열, 사용자 SessionStart 훅 이벤트 없음, 메모리 경로는 임시 폴더 전용(빈 폴더). `plugins`에는 Claude Code 내장 5개(`…@builtin`)만 있고 도구·스킬을 더하지 않음 | 내장 플러그인(`source`가 `@builtin`으로 끝남)은 허용, 그 밖은 `실패(격리)` |
| (neon a) 허용 목록만 줄 때 | init `tools`에 31개 전부 나온다(`browser_snapshot`·`browser_evaluate`·`browser_run_code_unsafe` 포함) | `--disallowedTools`로 20개를 명시적으로 뺀다 |
| (neon a) `--disallowedTools` 추가 | init `tools`가 허용 11개와 정확히 같다 | — |
| init 직후 SIGTERM | 이미 시작된 모델 턴 하나가 끝나고 `result`까지 나왔다 | 격리 불일치면 **유예 없이 SIGKILL** |

### T0에서 정한 것(플랜에 없거나 플랜과 다른 값)

사용자 결정으로 플랜 문서는 고치지 않고 이 작업 목록을 따른다.

- Playwright MCP 옵션: `--isolated --headless --caps vision --browser chromium --snapshot-mode none --no-webmcp --allowed-origins <오리진> --output-dir <플레이어 임시 폴더>/shots` + 기기 인자
  - `--browser chromium`: 기본값은 Chrome 채널이라 Chrome이 없는 맥에서 실패했다. Playwright가 받는 Chromium(`chromium-1255`)을 쓴다. 실행 플래그가 아니라 브라우저 선택이다
  - `--snapshot-mode none`: 기본값이면 도구 결과마다 접근성 트리 `.yml`을 output-dir에 쓰고 링크를 붙인다
  - `--no-webmcp`: 페이지가 실행 중에 도구를 등록할 수 있다. init 대조로는 못 잡는다
  - output-dir은 플레이어 임시 폴더 안에 둔다. 경로가 도구 결과에 그대로 보이므로 결과 폴더(`…/outpost-playtests/…`)를 직접 주면 작품 이름이 새어 나간다. 끝나면 실행기가 결과 폴더로 옮긴다
- 준비 단계: `npx -y -p @playwright/mcp@0.0.86 playwright install chromium`(같은 패키지에 든 Playwright로 맞는 Chromium을 받거나 있으면 넘어간다)
- (neon b) 행동 예산 **15회**, `--max-turns` **80**, 시간 상한 10분. 근거: 스크립트대로 움직인 확인 실행이 도구 10번에 11턴·23초·약 10만 토큰(대부분 캐시 읽기)이었다. 페르소나는 행동마다 스크린샷을 한 번 더 찍으므로 행동 1회 ≈ 2턴, 홀드 ≈ 5턴. 15회 × 2 + 홀드 여유 + 리포트 ≈ 40~50턴. 실제 페르소나 실행 값은 M의 첫 로컬 실행에서 다시 보고, 크게 다르면 리드가 `DEFAULTS`만 고친다
- (neon b) 미완료 토큰: `error_max_turns`의 `result.usage`가 있으면 그것, 없거나 시간 상한이면 assistant 이벤트를 `message.id`로 중복 제거(같은 id는 마지막 것)해 합산하고 `(근사)`를 붙인다. T0에서 턴 합산 출력 토큰이 `result`보다 적게 나왔다(1,142 대 1,427). `미집계`는 쓰지 않는다
- (neon c) 스크린샷 보관: 이름순(=시각순)으로 **처음 5장 + 최신 15장**. png만 옮기고 `console-*.log`·`.yml`은 버린다
- 정리: `claude`가 `~/.claude/projects/<임시 폴더 실경로를 영숫자 외 '-'로 바꾼 이름>/memory`를 빈 채로 남긴다. 실행기가 지운다. macOS는 `/var/folders`가 `/private/var/folders`의 링크이므로 `realpath`로 이름을 만든다
- stream-json에는 `rate_limit_event` 같은 다른 이벤트도 섞인다. 모르는 이벤트는 무시한다
- 알려진 한계: 도구 결과 글에 `Console: 0 errors, 1 warnings` 같은 콘솔 개수가 보인다. 내용은 못 본다. 이번 범위에서는 그대로 둔다

## T1 세부 (`scripts/playtest-lib.mjs`)

상수(`PLAYWRIGHT_MCP_PACKAGE`, `ALLOWED_TOOLS` 11개, `DENIED_TOOLS` 20개, `DEFAULTS`)는 리드가 넣어 두었다. 바꿔야 하면 리드에게 올린다. 함수 본문만 채운다. 시그니처는 파일의 JSDoc과 테스트가 기준이다.

- `parseTarget(url)`: `https://pr-<N>-outpost.<계정>.workers.dev`(경로 `/`까지) → `{ origin, label: 'pr-N' }`, `http(s)://localhost[:포트]` → `{ origin, label: 'local' }`. 그 밖(production, `http`의 Preview, 사용자 정보 포함, 비슷한 호스트)은 `null`
- `parseArgs(argv)`: `[--serial] <URL> [페르소나…]`. 페르소나가 없으면 `[]`(= 전원). URL이 없거나 모르는 플래그면 던진다
- `readDevice(text)` / `deviceArgs(device)`: `device:` 줄. `WxH`면 `--viewport-size`, 아니면 `--device`
- `buildMcpConfig({ origin, device, outputDir })`: 위 옵션 그대로, 서버 이름 `playwright`, `npx -y @playwright/mcp@0.0.86`
- `buildClaudeArgs({ prompt, mcpConfigPath, maxTurns })`: `-p`, `--model sonnet`, `--tools ""`, `--setting-sources ""`, `--strict-mcp-config`, `--mcp-config`, `--allowedTools`(쉼표), `--disallowedTools`(쉼표), `--disable-slash-commands`, `--no-session-persistence`, `--output-format stream-json`, `--verbose`, `--max-turns`. `--bare` 없음
- `buildPrompt({ url, persona, template, budget })`: URL·페르소나 문서·리포트 형식·행동 예산만. 작품 설명 금지. "스크린샷은 `filename` 없이 찍는다", "예산이 끝나면 리포트를 쓴다", "리포트 항목마다 근거 스크린샷 파일 이름"을 넣는다
- `checkIsolation(init)`: `tools`가 허용 목록과 집합으로 같다, `mcp_servers`는 `playwright` 하나이고 `connected`, `skills`·`slash_commands`는 비어 있다, `plugins`는 모두 `source`가 `@builtin`으로 끝난다
- `sumUsage(events)`, `classifyRun({ events, timedOut, exitCode, abort })`: 판정 순서 `abort` → init 없음(실패) → `is_error`이면서 API 오류(실패, 사유에 상태 코드) → `success`(완료, `result`·`duration_ms`·`usage`) → `error_max_turns`(미완료 `턴 상한`) → 시간 상한(미완료 `시간 상한`) → 다른 `result` subtype(미완료, 그 subtype) → `result` 없이 종료(실패). 미완료 리포트는 assistant 글을 순서대로 이어 붙인다
- `truncateReport`, `selectScreenshots`, `formatMode`, `formatHeader`, `runDirName`, `claudeProjectDirName`: 테스트대로. 머리 형식은 `상태: 완료|미완료(사유)|실패(사유)`, `실행 모드: …`, `기기: …`, `시간: N분 M초`, `토큰: 입력 N · 출력 N[ (근사)]`(입력 = input + 캐시 생성 + 캐시 읽기). 금액 없음

## T2 세부 (`scripts/playtest.mjs`, `scripts/playtest.sh`)

- `playtest.sh`는 `exec node "$(dirname "$0")/playtest.mjs" "$@"`만 한다
- 종료 코드: 전원 완료·미완료면 0, 하나라도 실패면 1, 인자·URL·페르소나 오류면 2(아무것도 띄우지 않고 결과 폴더도 만들지 않는다)
- 환경 변수(테스트가 쓴다): `PLAYTEST_CLAUDE_BIN`(기본 `claude`), `PLAYTEST_SKIP_PREP=1`, `PLAYTEST_RUNS_DIR`(기본 `$HOME/.local/share/outpost-playtests`), `PLAYTEST_PERSONAS_DIR`(기본 `docs/playtests/personas`), `PLAYTEST_REPORT_TEMPLATE`(기본 `docs/templates/playtest.md`), `PLAYTEST_ACTION_BUDGET`, `PLAYTEST_MAX_TURNS`, `PLAYTEST_TIMEOUT_SEC`(소수 허용), `PLAYTEST_KILL_GRACE_MS`, `PLAYTEST_STAGGER_SEC`
- 페르소나마다: `mkdtemp` 빈 폴더(저장소 밖) → `mcp.json` 작성 → `CLAUDE`로 시작하는 환경 변수를 뺀 env로 `spawn(..., { cwd, detached: true })` → stdout을 결과 폴더의 `stream.jsonl`로 흘리면서 줄 단위로 읽는다
- init 이벤트에서 `checkIsolation`이 실패하면 그 자리에서 **프로세스 그룹에 SIGKILL**, `abort = '격리'`
- 시간 상한: 그룹에 SIGTERM, `PLAYTEST_KILL_GRACE_MS` 뒤 남아 있으면 SIGKILL. 실행기가 SIGINT·SIGTERM을 받으면 남은 그룹을 같은 방식으로 끝내고 임시 폴더를 지운 뒤 0이 아닌 코드로 끝난다
- 끝나면: `classifyRun` → `report.md`(머리 + `truncateReport` 본문, 실패면 `실패(사유)` 한 줄) → `selectScreenshots`로 png 옮김 → 임시 폴더와 `~/.claude/projects/<claudeProjectDirName(realpath)>` 삭제
- 시간: 완료면 `duration_ms`, 아니면 벽시계
- 결과 폴더 `<RUNS_DIR>/<label>-<YYYYMMDD-HHMMSS>/<페르소나>/`. 마지막에 그 경로를 stdout에 찍는다
- 준비 단계(`PLAYTEST_SKIP_PREP`가 아니면, 병렬 실행 전 1회): 위 `playwright install chromium`. 실패하면 2로 끝낸다

## M 확인 (리드)

1. 전체 테스트(`npm test`, `npm run test:hooks`), `typecheck`·`lint`·`format:check`·`build`
2. 로컬(`wrangler dev`)로 실행기 3명 동시 1회: 격리 통과, 리포트·스크린샷, 행동 예산·턴 실측(DEFAULTS 재확인), 저장소 `git status` 깨끗
3. 로컬로 `PLAYTEST_TIMEOUT_SEC`를 짧게 줘 한 번 끊기: `미완료(시간 상한)`, 스크린샷 남음, Chromium·임시 폴더 없음
4. production URL 거절 확인
5. 페르소나·템플릿·스킬 문구가 플랜 의도(작품 설명 없음, 중립 질문)와 맞는지 읽어서 판단
6. Preview 3명 동시 실행과 이슈·요약 코멘트는 스킬 절차로 기획 에이전트가 한다(플랜 Verification)
