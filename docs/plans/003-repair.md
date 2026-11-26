# 003 — 첫 이정표: 함께 고치는 발전기

- 브랜치: `feat/003-repair`
- 등급: large
- 관련 이슈: 없음
- 마일스톤: M1 첫 이정표
- 상태: 플랜 승인(사용자, 2026-11-26) — 구현 중

## Context
콘텐츠 계획(`docs/content-plan.md`)의 첫 이정표다. **배포 URL에서 폰으로 발전기를 수리하면 PC에서도 경고등이 꺼진다.**
모델·조명·이펙트 전에, 공유 기지의 뼈대(서버가 상태를 갖고, 모두에게 같은 상태를 보여 주고, 수리는 한 번만 반영된다)를 큐브 하나로 끝까지 돌린다.
하네스 체인(플랜 리뷰 → 작업 분할·테스트 선작성 → 구현 → QA → Preview 확인 → 코드 리뷰 → Approve)을 처음으로 정식으로 타는 PR이기도 하다.

## 콘텐츠 (이 PR에서 보이는 것)
- 화면에 발전기 하나(큐브). 정상이면 차분한 초록, 고장이면 붉게 깜빡이고 위에 `⚠ 고장` 배지
- 큐브를 누르면 선택되고 오른쪽(폰은 아래) 패널에 상태와 **[수리] 버튼**. 버튼을 **1초 누르고 있으면** 수리 요청
- 상단에 `누적 수리 N회 · 지금 접속 N명 · 연결 상태`
- 누군가 고치면 모든 화면에서 동시에 초록으로 돌아온다. 내가 누르고 있던 도중 다른 사람이 먼저 고치면 홀드가 풀리고 "누군가 먼저 고쳤어요"
- 고친 뒤 20~40초가 지나면 발전기가 다시 고장 난다(접속자가 있을 때만)
- **첫 방문 보장:** 아무도 없던 기지에 첫 사람이 들어왔을 때(접속자 0→1), 고장도 없고 예약된 재고장도 없으면 바로 고장 하나를 만든다. 누가 막 고쳐서 재고장을 기다리는 중이면 새로 만들지 않는다

## 서버 (Durable Object `BaseRoom`)
- **상태(저장):** 현재 고장 `{ id, moduleId: "generator", createdAt } | null`, 누적 수리 수, `version`, `instanceId`. **한 객체로 한 번에** `ctx.storage.put` 한다(부분 저장으로 어긋나지 않게)
- **재고장 예약의 기준은 `ctx.storage.getAlarm()` 하나**다. 따로 예약 필드를 두지 않는다. 순수 함수는 `hasAlarm: boolean`을 입력으로 받는다
- **규칙 (순수 함수로 분리해 테스트):**
  - `repair(state, faultId)`: 현재 고장 id와 같을 때만 고장을 지우고 누적 수리 +1. 이미 고쳐졌거나 다른 id면 상태 그대로(멱등)
  - `ensureFault(state, now)`: 고장이 없으면 새 고장(새 id)을 만든다
  - 다음 고장 예약: 수리 후 20~40초 뒤 alarm. 접속자가 0이면 alarm을 걸지 않는다
  - **자가 복구:** 접속할 때와 클라이언트 요청(`repair`)을 처리할 때 "접속자가 있는데 고장도 예약도 없다"면 예약을 다시 건다(`setAlarm`이 실패했거나 빠진 경우에도 기지가 영원히 정상 상태에 갇히지 않게). `alarm()` 안에서는 검사하지 않는다(실행 시점엔 예약이 방금 소비돼 항상 "예약 없음"이기 때문)
  - `alarm()` 규칙: 이미 고장이 있으면 아무것도 안 한다(재시도 대비). 접속자가 0이면 고장을 만들지 않고 다시 예약하지도 않는다(다음 첫 방문 때 첫 방문 보장이 처리). 접속자가 있고 고장이 없으면 고장을 만든다
  - 수리 처리에서는 상태 저장 뒤 바로 `setAlarm`을 호출한다. 실패하면 위 자가 복구가 다음 접속·요청 때 바로잡는다
  - **처리 순서:** 상태 계산 → `ctx.storage.put` 완료 → 브로드캐스트. 저장이 실패하면 브로드캐스트하지 않는다. DO는 요청을 하나씩 처리하므로 동시 수리 두 건도 차례로 들어와 두 번째는 멱등 규칙에 걸린다
  - **버전:** 저장되는 기지 상태(고장·누적 수리)가 바뀔 때마다 `version`을 1 올린다. `snapshot`·`fault`·`repaired`에 담고, 클라이언트는 가진 것보다 낮은 버전을 버린다. 접속자 수(`presence`)는 저장하지 않으므로 버전 없이 최신 값으로 덮는다
  - **REST와 WS의 경계:** 클라이언트는 WS `snapshot`을 한 번이라도 받으면 그 뒤 도착하는 REST 응답을 무시한다
- **접속자 수:** Hibernation API의 `ctx.getWebSockets()` 개수로 센다(메모리 목록을 따로 두지 않아 하이버네이션·재시작에도 맞다). `webSocketClose`·`webSocketError` 안에서는 **닫히는 소켓을 빼고** 센다(콜백 시점에는 아직 목록에 남아 있을 수 있다). 연결·종료·오류 때 `presence`를 보낸다
- **브로드캐스트:** 소켓마다 `send`를 따로 `try/catch` 한다. 실패한 소켓은 닫고 넘어가서 나머지는 계속 받는다
- **유령 연결:** 모바일에서 소리 없이 끊긴 연결을 걸러내려고 `ctx.setWebSocketAutoResponse`로 ping/pong을 둔다(DO를 깨우지 않는다). 클라이언트가 20초마다 ping, 10초 안에 pong이 없으면 끊고 재연결
- **메시지 (`shared/protocol.ts`):**
  - 서버 → 클라: `snapshot`(전체 상태 + 접속자 수 + `version`), `fault`, `repaired`(faultId, 누적 수리), `presence`(접속자 수). `version`은 `snapshot`·`fault`·`repaired`에만 넣는다(`presence`는 버전 없음)
  - 클라 → 서버: `repair { faultId }`
  - 연결 직후에는 항상 `snapshot`을 먼저 보낸다(중도 합류·재연결)
- **방어:** 메시지 크기 256B 제한, 알 수 없는 메시지·형식 오류 무시, 소켓당 초당 5회 초과 무시
- **REST:** `GET /api/base` → 현재 `snapshot` JSON(`version`·`instanceId` 포함). 두 가지 용도다: 기술 목록의 REST 연동, WS가 붙기 전 첫 화면. 연결 전에는 수리가 잠겨 있으므로 보여 주기만 한다. 로컬 개발에서는 Vite 프록시가 `/api`도 `wrangler dev`로 넘긴다
- `instanceId`는 `snapshot`에 담아 둔다(Preview 격리 확인용, 화면에는 안 보임)
- DO 클래스는 기존 `BaseRoom`을 그대로 확장한다. 클래스 이름·바인딩이 같아 새 migration이 필요 없다
- 기존 `/ws` 에코는 이 프로토콜로 바뀐다

## 클라이언트
- `src/store.ts`(zustand): `snapshot`, 연결 상태(`connecting|open|reconnecting`), 선택된 모듈, 홀드 상태. 서버 메시지를 반영하는 함수는 순수 함수로 분리해 테스트
- `src/net/socket.ts`: 연결, 끊기면 지수 백오프 재연결(최대 10초). **연결 상태가 `open`이 아니면(`connecting`·`reconnecting` 모두) 수리 버튼 잠금**, 연결되면 `snapshot` 적용 후 활성화
- **홀드 상태:** `idle → holding(누르는 중) → pending(요청 보냄, 응답 대기) → idle`
  - `pending`에서 내 `faultId`로 `repaired`가 오면 성공("수리 완료")
  - `holding`에서 `repaired`가 오면 홀드 해제 + "누군가 먼저 고쳤어요"(3초 뒤 사라짐)
  - `holding`에서 손가락이 버튼을 벗어나거나, 탭이 가려지거나(`blur`·`visibilitychange`), 연결이 끊기면 조용히 취소. 모바일은 손가락이 벗어나도 `pointerleave`가 안 오므로 `pointermove`에서 버튼 영역(`getBoundingClientRect`) 이탈을 직접 검사하고, `pointercancel`도 취소로 본다
  - `pending`이 5초 안에 응답을 못 받거나, 그사이 재연결로 새 `snapshot`을 받으면 `idle`로 돌아간다(새 상태가 곧 답이다)
  - 두 사람이 둘 다 `pending`이면 둘 다 "수리 완료"가 뜬다. 함께 고친 것으로 보고 그대로 둔다(누적은 +1)
- `src/net/api.ts`: `/api/base` 첫 조회
- `src/scene/Generator.tsx`: 큐브, 상태 색·고장 시 emissive 펄스, 클릭 선택, drei `<Html>` 배지(고장·선택일 때만)
- `src/ui/Panel.tsx`: 선택 모듈 상태, 홀드 수리 버튼(HTML, 1초), 진행 표시, 안내 문구. 모바일 길게 누르기 방어: `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`, `contextmenu` 차단
- `<Html>` 배지는 `pointer-events: none`(큐브 터치를 가리지 않게)
- 의존성은 이미 설치된 것만 쓴다(`zustand`, `@react-three/drei`). 새로 추가하지 않는다
- `src/ui/Hud.tsx`: 누적 수리·접속자·연결 상태
- 구조 규칙: `scene/`은 그리기, `net/`은 통신, `ui/`는 패널. 기지 상태는 서버만 바꾼다(클라는 요청만)

## 테스트 (개발 리드가 먼저 작성)
- 서버 로직: `repair` 멱등(같은 고장 두 번 → +1만), 다른 id 무시, `ensureFault`, 첫 방문 보장 조건(0→1, 예약 없음), `alarm` 멱등(고장 있음·접속자 0), 자가 복구(접속자 있음·고장 없음·예약 없음 → 예약), `version` 증가, 메시지 파싱·크기 제한·rate limit
- DO: 종료 콜백에서 닫히는 소켓을 뺀 접속자 수, 한 소켓 `send` 실패해도 나머지는 받음
- DO: 두 소켓 연결 → 한쪽 수리 → 양쪽에 `repaired`, 재접속 시 `snapshot`, 동시 수리 두 번 → 누적 +1
- UI 로직: 스토어가 `snapshot`·`repaired`·`fault`를 반영, 낮은 `version` 버림, WS `snapshot` 뒤 REST 무시, `presence`는 항상 최신으로, 홀드 상태 전이(`holding`에서 `repaired` → "먼저 고쳤어요", `pending`에서 내 `repaired` → 성공, 연결 끊김·취소·5초 시간 초과)
- 렌더링·연출은 테스트하지 않는다

## 하지 않는 것
- 플레이어 페르소나 자동 플레이테스트: 하네스 자동화(004)에서 만든다. 이번에는 **사용자가 Preview를 폰과 PC로 열어 확인**한다

## Verification
- `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:hooks`
- Preview URL을 **폰과 PC에서 동시에** 연다 → 한쪽에서 1초 홀드 수리 → 다른 쪽 경고가 바로 꺼지고 누적 수리가 같이 오른다
- 동시 수리 멱등은 DO 테스트로 확정한다. 손으로는 **한쪽이 홀드하는 도중 다른 쪽이 먼저 수리** → 홀드가 풀리고 "누군가 먼저 고쳤어요"가 뜨는지 본다
- 한쪽 탭을 새로고침·네트워크 끊었다 연결 → "재연결 중"·버튼 잠금 → 복구 후 같은 상태
- 수리 후 20~40초 뒤 다시 고장, 접속자 0이면 새 고장이 생기지 않는다(DO 테스트)
- 모바일: 1초 홀드가 텍스트 선택·메뉴·스크롤로 끊기지 않고, 홀드 중 카메라가 돌지 않는다
- 번들 크기(gzip)를 PR 본문에 기록한다(예산 잠정치 600KB)
- **머지 후:** production `/api/base`의 `instanceId`가 Preview(`pr-9`)와 다르다(머지 전에는 production에 `/api/base`가 없다. Preview는 PR마다 DO 저장소가 분리된다 — PR #1에서 실측)
