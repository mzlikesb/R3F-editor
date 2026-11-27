# 006 — 작업 목록

플랜: `docs/plans/006-shared.md`. 작업끼리 파일이 겹치지 않게 나눈다. 경계는 인터페이스로 긋는다.

트랙 server·client·scene은 파일이 겹치지 않아 **병렬**로 돌린다(각자 worktree, `isolation: worktree`). 리드가 결과를 `feat/006-shared`로 모은다(M). 공용 타입·함수는 리드가 먼저 완성해 두었고, 아래 "파일 소유" 표의 주인만 고친다.

| #      | 작업                                                       | 담당 | 파일               | 완료 조건                                          | 연결 테스트                                                                                                                                                         | 상태 |
| ------ | ---------------------------------------------------------- | ---- | ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| T1     | 프로토콜·센서 완성, 뼈대·인터페이스·선작성 테스트          | 리드 | "리드가 만든 것"   | format·lint·typecheck 통과, 테스트는 의도대로 실패 | 아래 각 트랙                                                                                                                                                        | 완료 |
| server | 상태 규칙·저장 키 이전·alarm 단일화·홀드·옛 탭 경로·REST   | 개발 | "파일 소유" server | "server 수용 기준"                                 | `worker/state.test.ts`, `worker/holds.test.ts`, `worker/legacy.test.ts`, `worker/socketId.test.ts`, `worker/rateLimit.test.ts`, `worker/broadcast.test.ts`, `worker/test/base.test.ts` | 대기 |
| client | store·동기화·홀드·토스트·HUD·기록 패널·패널 센서·배너·WS    | 개발 | "파일 소유" client | "client 수용 기준"                                 | `src/sync.test.ts`, `src/hold.test.ts`, `src/feedback.test.ts`, `src/store.test.ts`, `src/ui/view.test.ts`, `src/ui/sensorView.test.ts`, `src/net/url.test.ts`     | 대기 |
| scene  | 모듈별 고장 표현·배지 우선순위·고치는 중 고리·정전 연출    | 개발 | "파일 소유" scene  | "scene 수용 기준"                                  | `src/scene/fx/labelRules.test.ts`, `src/scene/blackout.test.ts` (나머지는 렌더링·연출이라 TDD 대상 아님)                                                           | 대기 |
| M      | 병합·의도 확인                                             | 리드 | —                  | "M 확인"                                           | 전체                                                                                                                                                                | 대기 |

## 리드가 만든 것 (T1)

- **완성(구현까지)**: `shared/protocol.ts`(프로토콜 2 타입, 파서, `isIncompatibleSnapshot`, `socketProtocol`, `Legacy*` 타입), `shared/sensors.ts`(`sensorValue`·`formatSensor`·`sensorRange`·`SENSORS`), `src/modules.ts`(모듈 5개가 모두 서버 `ModuleId`, 조사 `을/를`·`이/가`), `shared/testdata/v1.ts`(main `ab8d6ca` 시점의 `parseServerMessage`와 `applyServerMessage`를 그대로 옮긴 픽스처)
- **빈 구현(시그니처·문서 주석만, 본문은 `throw new Error('TODO(트랙): ...')`)**: 아래 "파일 소유"에서 TODO가 있는 파일 전부
- **컴파일용 자리표시**: `src/ui/Hud.tsx`·`Panel.tsx`·`Toast.tsx`·`BottomStack.tsx`·`src/net/socket.ts`·`api.ts`, `src/scene/fx/ModuleFx.tsx`·`Labels.tsx`는 새 타입으로 컴파일만 되게 최소한 고쳤다. 각 트랙이 다시 쓴다
- `worker/index.ts`는 손대지 않았다(`/api/history` 경로는 server가 넣는다)
- 선작성 테스트가 서로 맞는지, 구현할 수 있는지는 리드가 버리는 참조 구현으로 확인했다(전체 통과 후 빈 구현으로 되돌림)

## 파일 소유

같은 파일을 두 트랙이 고치지 않는다. 표에 없는 새 파일은 자기 트랙 폴더 안에만 만든다(server: `worker/`, client: `src/`의 `scene/` 밖, scene: `src/scene/`).

| 트랙   | 파일 |
| ------ | ---- |
| server | `worker/state.ts`, `worker/holds.ts`, `worker/legacy.ts`, `worker/socketId.ts`, `worker/rateLimit.ts`, `worker/broadcast.ts`, `worker/BaseRoom.ts`, `worker/index.ts` |
| client | `src/store.ts`, `src/sync.ts`, `src/hold.ts`, `src/feedback.ts`, `src/net/*`, `src/ui/*`(새 파일 포함: 기록 패널·배너·센서 추이), `src/index.css`, `src/App.tsx`(새 UI 컴포넌트를 여기서 붙인다) |
| scene  | `src/scene/**`(`fx/` 포함, `scene.css`·`fx.css`) |
| 리드   | `shared/**`, `src/modules.ts`, 모든 `*.test.ts`(개발은 테스트를 고치지 않는다. 테스트가 틀렸다고 보면 사유를 리드에게 돌려준다) |

`package.json`·의존성은 아무 트랙도 건드리지 않는다(플랜에 새 의존성 없음).

## 트랙 사이 인터페이스

### 공용 (리드, `shared/`)

- 메시지: `SnapshotMessage`(protocol 2, `faults`, `uptimeStartedAt`, `longestUptimeMs`, `blackout`, `blackouts` 최근 5, `lastRepair`, `serverNow`), `FaultMessage.blackoutStart`, `RepairedMessage.moduleId·at·blackoutEnd`, `ActivityMessage.holds`(받는 소켓 자신을 뺀 수, 1 이상만), `HistoryResponse`, `ClientMessage` = `repair | hold | release`
- 옛 탭: `LegacySnapshotMessage`, `LegacyRepairedMessage`. 서버만 보낸다
- WS 연결: `/ws?protocol=2`(`PROTOCOL_PARAM`, `PROTOCOL_VERSION`). 서버는 `socketProtocol(url)`로 읽는다
- 센서: `sensorValue(moduleId, fault, serverNow)`는 결정적. `now < fault.createdAt`이면 정상 곡선. 화면 문자열은 `formatSensor`, 그래프 범위는 `sensorRange`(고정)

### server → client: 서버가 보장하는 것

- 첫 메시지는 소켓 프로토콜에 맞는 snapshot(2면 `toSnapshot`, 1이면 `toLegacySnapshot`)
- 무인 시간 고장은 첫 snapshot 안에 이미 들어 있다. 그 뒤의 `fault`는 모두 "접속 중에 난 고장"이다(그래서 client는 `fault`마다 토스트를 띄운다)
- `activity`는 소켓별로 계산해 보낸다. client는 자기 홀드를 빼지 않는다(neon (b))
- 정전 시작 `fault`에 `blackoutStart`, 정전 종료 `repaired`에 `blackoutEnd`가 실린다(neon (e)). client의 기록 패널·HUD는 이것만으로 갱신한다

### client → scene: store selector (`src/store.ts`)

scene은 store를 아래로만 읽는다. 모두 상태가 같으면 같은 값(참조)을 돌려준다.

- `useStore(selectFaults)` → `readonly Fault[]`(오래된 순, 바뀔 때만 새 배열)
- `useStore((s) => selectModuleFault(s, id))` / `selectModuleStatus(s, id)` → `Fault | null` / `'fault' | 'ok'`
- `useStore(selectBlackout)` → `boolean`, `useStore(selectAnyFault)` → `boolean`
- `useStore((s) => selectOthersHolding(s, id))` → `number`(다른 사람 수), `useStore(selectActivity)` → `faultId → 수`
- 서버 시각: `selectServerNow(useStore.getState(), Date.now())` — 배지 센서 수치를 0.5초마다 DOM ref로 고칠 때 쓴다(구독하지 않는다)
- 선택: `useStore((s) => s.selected)`, 바꿀 때는 `useStore.getState().select(id)`만
- 수리 연출: `useStore((s) => s.feedback.effect)` → `{ outcome, moduleId, seq, at } | null`. `effect.moduleId === id`인 모듈만 재생한다. 판정은 `effectsFor(outcome)`

### scene 내부 규칙 (scene 소유, 테스트는 리드)

- `labelPlan({ faults, selected, blackout, holding })` → `{ badge, dots, tag }`, `holding = holdingModules(faults, activity)`, `badgeText(id, { othersHolding, sensorText })`
- `relightDelayMs(id)`(`RELIGHT_STEP_MS` 150)

## neon 3턴 뒤 지적 (사용자 승인: 플랜 대신 여기서 못 박는다)

| 지적 | 규칙 | 담당 | 못 박은 테스트 |
| --- | --- | --- | --- |
| (a) 짧은 재접속으로 고장을 무한히 만들 수 있음 | 무인 시간은 `lastSavedAt`부터 `MIN_UNATTENDED_MS`(60초) 이상 지났을 때만 계산한다. 60초는 최대 고장 간격(40초)보다 길어서, 적용될 때는 "최소 1개"가 저절로 성립한다. 60초 미만이면 고장 0개(새로고침 10번도 0개) | server | `state.test.ts` "arrive (0 -> 1)" (a) 3건, `base.test.ts` "unattended time" (a) 2건 |
| (b) activity 자기 차감 레이스, rate limit에 걸린 hold | 서버가 소켓마다 `activityFor(모든 홀드, 받는 소켓의 홀드)`로 보낸다. client는 받은 값을 그대로 쓴다. `admit()`: `release`는 한도와 무관하게 처리하고 예산도 쓰지 않는다. 한도에 걸린 `hold`는 attachment에 기록하지 않는다 | server, client | `holds.test.ts` activityFor, `rateLimit.test.ts` admit, `base.test.ts` "activity" (b) 2건, `store.test.ts` "(b) others holding…" |
| (c) alarm 단일화 | 예정 시각 = `plannedAlarmAt(state, earliestExpiry(holds))` = min(`nextFaultAt`, 가장 이른 홀드 만료). 모든 이벤트 뒤에 `decideAlarm`(없거나 더 늦으면 set, 접속 0이면 delete)을 한 번 부른다. 이것이 자가 복구다. 3번째 고장 순간 `nextFaultAt` null, 홀드 만료·release·소켓 종료·수리 뒤에도 같은 규칙으로 다시 예약 | server | `state.test.ts` "plannedAlarmAt"·"decideAlarm"·injectFault 상한, `base.test.ts` "blackout" (c) 2건·"activity" 만료/상한 2건·"self-heal" 2건 |
| (d) 다중 고장·정전 화면 우선순위 | 큰 배지 하나: 정전 중 발전기 > 다른 사람이 고치는 중인 모듈(작은 ⚠ 점이었어도 승격) > 선택한 고장 모듈 > 발전기 > 가장 오래된 고장. 나머지는 ⚠ 점. 패널 이동 버튼도 정전 중이면 발전기 | scene, client | `labelRules.test.ts` (d) 2건 + 전수 검사, `view.test.ts` panelView (d) |
| (e) 1→0 deleteAlarm, 정전 시작 fault 내용 | 마지막 소켓이 닫히면 `leave`(저장 시각) 저장 후 `deleteAlarm()`. 정전을 연 `fault`에 `blackoutStart { blackout, uptimeStartedAt: null, longestUptimeMs, record }` | server, client | `base.test.ts` "(e) the last one out…", `state.test.ts` "blackout start", `base.test.ts` blackout 순서, `sync.test.ts` "(e)…" |

## server 수용 기준 (플랜 A, B.11-B.14)

- 순수 규칙은 `worker/state.ts`·`holds.ts`·`legacy.ts`·`socketId.ts`·`rateLimit.ts`의 문서 주석대로. 새 상태를 돌려주는 함수는 모두 `lastSavedAt = now`
- 저장: `STATE_KEY = 'base:v2'` 한 키에 `put` 한 번. `base:v2`가 없으면 `LEGACY_STATE_KEY`(`base`)를 읽어 `migrateLegacy`, 그것도 없으면 `INSTANCE_ID_KEY`로 `initialState`. 옛 키는 쓰지도 지우지도 않는다. `wrangler.jsonc`는 바꾸지 않는다
- `BaseRoom`은 이벤트마다 저장소를 읽는다(메모리에 `BaseState` 사본을 두지 않는다. 통합 테스트가 저장소를 직접 심는다). 처리 순서는 `worker/BaseRoom.ts` 머리 주석이 계약이다
- 0→1 판정은 `ctx.getWebSockets().length`(방금 받은 소켓 포함)가 1인지로 한다. 인메모리 카운터를 두지 않는다(하이버네이션)
- 홀드는 attachment(`{ id, protocol, hold }`)에만 둔다. 저장하지 않는다
- 프로토콜 1 소켓: 이벤트 메시지(`fault`·`activity`)를 보내지 않는다. 상태가 바뀌면 `legacyUpdate`대로 옛 snapshot 또는 옛 `repaired`(소켓별 `mine`)
- `GET /api/base`·`GET /api/history`: 순수 읽기(저장·`arrive`·alarm 없음). `worker/index.ts`에 `/api/history` 경로를 넣는다
- 브로드캐스트는 `broadcastEach`로 소켓별 메시지를 만든다(`mine`, `activity`, 프로토콜 분기)
- 연결 테스트 전부 통과(`npm run test:worker`)

## client 수용 기준 (플랜 B.13, C.15-C.21)

- 순수 로직은 `sync.ts`·`hold.ts`·`feedback.ts`·`store.ts`·`ui/view.ts`·`ui/sensorView.ts`·`net/url.ts` 문서 주석대로. `receive` 순서(store 주석 1~5)를 지킨다
- WS: `socketUrl(location)`으로 연결. 프레임마다 `isIncompatibleSnapshot(raw)`이면 `markIncompatible()`(수리 잠금). `receive(msg, performance.now(), Date.now())`, `applyRest(snap, Date.now())`
- 홀드: `press`/`release`/`cancel` 때 `hold`/`release`가 나간다(`reduceHold`의 `send`). 선택이 바뀌거나(`select`), 기록 패널을 열거나, 그 고장이 사라지면 홀드를 취소하고 `release`(#15-4)
- HUD: 윗줄 `hudTopLine`(1초마다 DOM ref로 글자만 바꾼다. React 렌더 없음), 정전이면 맨 위에 `blackoutBanner`, `lastRepairLine`(서버 시각 기준). HUD를 누르면 기록 패널(`historyView`). 기록 패널과 수리 패널은 동시에 열리지 않는다(`openHistory`·`select`). HUD가 눌린다는 단서(예: 작은 `›`)를 둔다
- 패널: `panelView` 결과대로. 고장 모듈이면 수리 버튼(`repairFaultId`)과 `together`, 아니면 `goTo` 버튼(`select(goTo.moduleId)`). 센서 `sensorLine`과 30초 추이 SVG(`trendSamples` → `trendPoints`, `<svg>` 하나에 `<polyline>` 하나), 패널이 열린 모듈만 `PANEL_TICK_MS`(0.5초)마다 DOM ref로 갱신
- 배너: `updateBanner(incompatible)`가 있으면 `새 버전이 나왔어요 · 새로고침`, 누르면 `location.reload()`
- 토스트: `toastText(toast)`. 고장 토스트는 경고 색
- 폰(390×844)에서 정전 배너 + HUD 3줄 + 업데이트 배너가 함께 떠도 모듈 배지를 가리지 않게 HUD를 한 덩어리로 쌓는다
- 연결 테스트 전부 통과(`npm test`의 app 프로젝트)

## scene 수용 기준 (플랜 C.15-C.18)

- 모든 고장 모듈에 005의 고장 표현(붉은 펄스·본체 어둡게·바닥 링)을 적용한다. 상태는 위 selector로만 읽는다. 수리 연출(sweep·burst·ringPing)은 `effect.moduleId`인 모듈에서만
- 라벨: 모듈마다 따로 계산하지 말고 한 곳(예: `BaseCanvas` 안 작은 컴포넌트 또는 공용 훅)에서 `labelPlan`을 한 번 계산해 각 모듈에 넘긴다. 큰 배지는 `badgeText`, 점은 작은 `⚠`(누르면 그 모듈 선택, `stopPropagation`). 배지의 센서 수치는 0.5초마다 DOM ref로 고친다(`selectServerNow` + `formatSensor(sensorValue(...))`). `useFrame` 안에서 할당 금지
- 누군가 고치는 중: `selectOthersHolding(s, id) >= 1`인 모듈 위에 작은 진행 고리(링 메시 하나, 공용 지오메트리·머티리얼). 그 모듈이 큰 배지면 문구는 배지 한 줄에 합친다(따로 띄우지 않는다). 점 모듈이어도 고리는 보인다
- 정전: directional·ambient를 낮추고 배경 그라디언트를 더 어둡게. 빨간 비상등 `pointLight` 하나가 기지 둘레를 돈다(그림자 없음, `distance` 제한). **비상등은 항상 마운트하고 `intensity`만 0/켜짐으로 바꾼다**(광원 수가 바뀌면 셰이더가 다시 컴파일돼 폰에서 끊긴다). 고장 모듈의 붉은 펄스는 정전 중에도 보이고, 발전기는 정전 중 더 밝다
- 복구: 정전이 true→false로 바뀌면 `relightDelayMs(id)` 순서로 모듈 조명이 돌아온다(0.15초 간격). 마운트 시점에 이미 정상이면 재생하지 않는다
- 성능: 정전·비상등·고장 3개·고리 상태에서 `?perf` 드로우콜 100 이하. `useFrame` 안 setState·`new` 금지
- client 파일은 고치지 않는다. 확인용으로 자기 worktree에서 client selector를 잠시 채워 볼 수는 있지만 **그 변경은 커밋하지 않는다**(커밋 전 `git diff --stat`)
- 연결 테스트 통과(`labelRules.test.ts`, `blackout.test.ts`)

## M 확인 (리드)

- 병합 순서 server → client → scene(scene이 client selector를 실제로 쓰므로 마지막)
- `format:check`·`lint`·`typecheck`·`npm test`·`test:worker`·`test:hooks`·`build` 통과
- 파일 소유 표 밖 변경이 없는지 `git diff --stat`
- 의도 확인(로컬 `npm run build` → `wrangler dev`, 탭 2개): 여러 모듈 고장, 한쪽 홀드 중 다른 쪽 `누군가 고치는 중`(자기 화면엔 안 뜸), 고장 3개 → 정전(조명·비상등·HUD) → 발전기 수리 → 순차 점등, 두 탭 가동 시간 일치, 새로고침 반복으로 고장이 생기지 않음, 쿼리 없는 `/ws`(옛 빌드 정적 파일)로 연 탭의 발전기 수리, 탭을 모두 닫으면 `getAlarm()` null, `/api/history`, 390×844 배지·점·HUD 겹침, `?perf` 드로우콜
