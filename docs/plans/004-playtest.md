# 004 — 페르소나 플레이테스트

- 브랜치: `chore/023-playtest`
- 등급: large
- 관련 이슈: Closes #23
- 마일스톤: M2 기지와 상호작용
- 상태: 플랜 리뷰

## Context

기능 PR의 Preview는 지금 사용자가 폰·PC로 직접 확인한다. 3D 화면을 처음 본 사람이 설명 없이 무엇을 하는지 확인할 장치가 없다.

사전 정보가 없는 페르소나 에이전트 3명이 Preview URL만 받아 브라우저로 플레이하고, 본 것과 한 것만 리포트로 남긴다. 기획 에이전트가 리포트를 읽고 지적을 이슈로 올린다. 헤드리스 Chromium에서 렌더링과 클릭·홀드가 된다는 것은 #22에서 확인했다.

경험 원칙 1·3을 확인하는 장치다. 다만 페르소나에게는 원칙을 주지 않는다. 원칙을 몰라도 느껴지는지가 확인 대상이다.

## 만들 것

1. **`scripts/playtest.sh <URL> [페르소나…]`**: 페르소나 하나당 독립된 `claude -p` 프로세스를 띄운다. 기본값은 3명 전원이고, **3명을 동시에** 돌린다. 같은 기지에 동시에 접속하므로 접속자 수와 남의 수리가 실제로 보인다.
   - 작업 폴더는 빈 전용 폴더 `${PLAYER_SANDBOX_DIR:-$HOME/projects/money/player-sandbox}/<페르소나>`이다. 저장소 밖이라 `CLAUDE.md`·`AGENTS.md`가 로드되지 않는다.
   - 실행 전에 그 폴더 몫의 Claude 메모리 폴더를 비운다. 실행에는 `--no-session-persistence`를 준다.
   - 내장 도구는 끈다(`--tools ""`). MCP는 `--strict-mcp-config --mcp-config <생성한 json>`으로 Playwright만 쓴다.
     - 허용 범위는 `--allowedTools "mcp__playwright__*"`이고, `--disable-slash-commands`로 사용자 스킬도 끈다.
     - 사용자 전역 설정이 섞이지 않게 `--bare`를 우선 쓴다. 인증 때문에 안 되면 `--setting-sources`를 비우는 쪽으로 간다.
   - Playwright MCP는 `npx @playwright/mcp@<고정 버전>`으로 받고 `package.json` 의존성에는 넣지 않는다. 옵션은 `--isolated --headless`와 페르소나별 `--output-dir`이다.
     - 폰 페르소나에는 `--device "iPhone 13"`(390×844, 터치)을, PC 페르소나에는 1280×800 뷰포트를 준다.
   - 프롬프트로는 **페르소나 문서와 리포트 형식만** 넘긴다. URL 말고는 이 작품에 대한 설명을 넣지 않는다.
   - 모델은 Sonnet이고, 페르소나당 턴 상한(`--max-turns`)과 시간 상한을 둔다. 넘으면 그때까지의 리포트로 끝낸다.
   - 결과는 `--output-format json`으로 받는다. 리포트 본문과 함께 걸린 시간(`duration_ms`)과 토큰(`usage`)을 리포트 머리에 적는다. 금액은 적지 않는다(#19와 같은 기준).
   - 수거한 결과는 `docs/playtests/<YYYY-MM-DD>-<대상>/<페르소나>/`에 둔다. `report.md`와 스크린샷이며, 스크린샷은 페르소나당 최대 4장이다.
2. **페르소나 3종** `docs/playtests/personas/`:
   - `phone-casual.md`: 출퇴근길 폰으로 캐주얼 게임을 하는 사람
   - `pc-dev.md`: 3D·웹 기술에 관심 있는 PC 개발자
   - `first-visitor.md`: 게임을 거의 안 하고 링크를 받아 처음 들어온 사람
   - 각 문서에는 누구인지, 어떤 기기로 들어오는지, 얼마나 참을성 있는지만 쓴다. 이 작품에 대한 정보는 없다.
3. **템플릿**
   - `docs/templates/persona.md`, `docs/templates/playtest.md`
   - 리포트 형식은 다음과 같다:
     - 이게 뭐라고 생각했나
     - 처음 10초에 본 것
     - 한 것(순서대로)
     - 막히거나 헷갈린 곳
     - 좋았던 것
     - 다시 들어올 것 같은가
     - 각 항목의 근거 스크린샷
   - 질문은 중립으로 쓰고 원칙의 말을 쓰지 않는다.
4. **이슈 템플릿** `.github/ISSUE_TEMPLATE/`에 `playtest.yml`, `art-ux.yml`, `quality.yml`을 만든다. `결정할 것` 칸을 맨 위에 두고, 라벨은 템플릿이 붙인다.
5. **프로젝트 스킬 `.claude/skills/playtest`**: 기획 에이전트가 PR을 `stage:playtest`로 넘길 때 부르는 절차다.
   - 먼저 Preview URL로 스크립트를 실행한다.
   - 그다음 리포트를 읽고 지적을 원칙과 대조해 `playtest` 이슈로 올린다. 같은 지적이 둘 이상 나오면 하나로 묶는다.
   - 마지막으로 PR에 요약 코멘트를 단다. 요약에는 페르소나별 한 줄, 올린 이슈 번호, 시간과 토큰을 넣는다.
6. **`AGENTS.md`**: 워크플로우의 플레이테스트 줄과 완료 기준을 실제 흐름으로 바꾼다. 첫 실행 결과를 보고 다음 중 하나로 정한다:
   - 페르소나 플레이테스트 다음에 사용자가 확인한다.
   - 사용자 확인만 한다.
7. **`CLAUDE.md`**: 역할별 스킬 절에 `기획: stage:playtest에서 playtest`를 넣는다.

## 하지 않는 것

- 서브에이전트(`.claude/agents/player.md`)와 프로젝트 `.mcp.json`
  - 둘 다 저장소 컨텍스트를 같이 받는다. 그래서 플레이어는 저장소 밖의 별도 프로세스로만 돈다.
- 매 PR 자동 실행. 기획 에이전트가 `stage:playtest`에서 부른다.
- neon 아트/UX 크리틱(#24, 이 PR의 스크린샷을 입력으로 쓴다)
- 플레이 녹화(GIF·영상)

## Verification

- 격리를 확인한다:
  - stream-json의 `init` 이벤트에서 도구 목록이 `mcp__playwright__*`뿐이다.
  - 페르소나에게 "지금 쓸 수 있는 파일이나 문서가 있나"를 물으면 없다고 답한다.
  - 플레이어 폴더에 저장소 파일이 없다.
- production URL로 3명을 동시에 한 번 돌린다:
  - 3명 모두 `report.md`와 스크린샷을 남긴다.
  - 폰 페르소나의 스크린샷이 세로 모바일 비율이다.
- 실행 중에 HUD 접속자 수가 3 근처로 보이는지 스크린샷이나 리포트에서 확인한다.
- 리포트의 지적이 스킬 절차대로 `playtest` 이슈로 올라간다. 이슈 템플릿이 `결정할 것` 칸을 채운다.
- 실행 하나의 시간과 토큰이 리포트 머리와 PR 요약 코멘트에 남는다.
- `npm run test:hooks`가 통과한다. 스크립트의 인자 처리와 결과 수거 경로는 가짜 `claude` 실행 파일로 테스트한다.
