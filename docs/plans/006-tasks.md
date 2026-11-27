# 006 — 작업 목록

플랜: `docs/plans/006-shared.md`. 작업끼리 파일이 겹치지 않게 나눈다. 경계는 인터페이스로 긋는다.

트랙 server·client·scene은 파일이 겹치지 않아 **병렬**로 돌린다(각자 worktree, `isolation: worktree`). 리드가 결과를 `feat/006-shared`로 모은다(M). 공용 타입·함수는 리드가 먼저 완성해 두었고, 아래 "파일 소유" 표의 주인만 고친다.

| #      | 작업                                                       | 담당 | 파일               | 완료 조건                                          | 연결 테스트                                                                                                                                                         | 상태 |
| ------ | ---------------------------------------------------------- | ---- | ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| T1     | 프로토콜·센서 완성, 뼈대·인터페이스·선작성 테스트          | 리드 | "리드가 만든 것"   | format·lint·typecheck 통과, 테스트는 의도대로 실패 | 아래 각 트랙                                                                                                                                                        | 완료 |
| server | 상태 규칙·저장 키 이전·alarm 단일화·홀드·옛 탭 경로·REST   | 개발 | "파일 소유" server | "server 수용 기준"                                 | `worker/state.test.ts`, `worker/holds.test.ts`, `worker/legacy.test.ts`, `worker/socketId.test.ts`, `worker/rateLimit.test.ts`, `worker/broadcast.test.ts`, `worker/test/base.test.ts` | 완료 |
| client | store·동기화·홀드·토스트·HUD·기록 패널·패널 센서·배너·WS    | 개발 | "파일 소유" client | "client 수용 기준"                                 | `src/sync.test.ts`, `src/hold.test.ts`, `src/feedback.test.ts`, `src/store.test.ts`, `src/ui/view.test.ts`, `src/ui/sensorView.test.ts`, `src/net/url.test.ts`     | 완료 |
| scene  | 모듈별 고장 표현·배지 우선순위·고치는 중 고리·정전 연출    | 개발 | "파일 소유" scene  | "scene 수용 기준"                                  | `src/scene/fx/labelRules.test.ts`, `src/scene/blackout.test.ts` (나머지는 렌더링·연출이라 TDD 대상 아님)                                                           | 완료 |
| M      | 병합·의도 확인                                             | 리드 | —                  | "M 확인"                                           | 전체                                                                                                                                                                | 완료 |

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
| server | 완료 |
| client | 완료 |
| scene  | 완료 |
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

## 결과 (M)

커밋: server `d1298db`, client `c46b109`, scene `338ba03`, 리드 수정 `8fe702b`·`ab8df5b`. 세 트랙 모두 테스트를 고치지 않았고, 파일 소유 표 밖 변경은 없다(client의 `src/App.tsx`는 머리 주석만).

검사: `format:check`·`lint`·`typecheck`·`npm test`(22 파일 267건)·`test:worker`(7 파일 120건)·`test:hooks`·`build` 통과.

트랙 판단 중 받아들인 것:

- server: `activityFor`는 받는 소켓의 홀드를 값으로 뺀다(attachment를 매번 다시 읽어 참조가 같지 않다). 새 프로토콜 2 소켓은 다른 홀드가 있으면 snapshot 바로 뒤에 `activity`를 한 번 받는다. 파싱 못 한 프레임은 rate limit 예산을 쓰지 않는다. `arrive` 고장은 소켓이 하나일 때만 생기므로 따로 브로드캐스트하지 않는다(첫 snapshot에 들어 있다). `base:v2`가 없을 때 REST는 저장하지 않으므로 첫 접속 전에는 `instanceId`가 요청마다 다를 수 있다
- client: 기록 패널은 열려 있을 때만 1초마다 React로 다시 그린다. HUD 윗줄을 DOM ref로 바꾸면서 005의 수리 횟수 `bump`는 없어졌다(presence `bump`는 남음). `historyView`의 정전 시각은 시작 기준이다(주석 예시를 테스트에 맞춤)
- scene: `labelPlan`은 `LabelPlanProvider` 한 곳에서 계산한다. 비상등은 항상 마운트해 광원 수가 +1이다

리드가 고친 것:

- 정전이 거의 어두워지지 않았다. 지면·바위는 HDRI 환경광이 대부분을 비추므로 `scene.environmentIntensity`도 직접광과 같은 비율로 낮춘다
- 고치는 중 고리가 모듈 꼭대기 위에 있어 배지·`⚠` 점에 가려졌다(폰에서 거의 안 보임). 모듈 몸통 중간 높이에 몸통보다 넓게 두른다
- 서버를 읽을 수 없는 빌드(업데이트 배너)에서는 패널의 `연결되면 수리할 수 있어요`를 띄우지 않는다

로컬 확인(`wrangler dev`, 저장소 조작용 `/__dev` 경로는 레포 밖 래퍼에만 두었다. Playwright headless, swiftshader):

- 두 모듈 고장: 큰 배지 1개 + `⚠` 점 1개. A가 누르는 동안 B 배지가 `⚠ 통신탑 고장 · 누군가 고치는 중`, A 화면에는 안 뜸. 정상 release 뒤 바로 사라짐, release 프레임을 버려도 2.7초 뒤 사라짐
- 3번째 고장이 발전기로 들어가 정전, `nextFaultAt` null. alarm을 두 번 더 불러도 정전 이력 1개. HUD `정전 — 발전기를 고쳐야 불이 돌아와요`·`가동 기록 끊김 · 최장 26초`, 조명 소등·비상등. 정전 중 다른 사람이 고치는 모듈은 점+고리(큰 배지는 발전기)
- 발전기 수리 뒤 연결 유지 탭 2개와 새 탭의 가동 시간이 같다. 기록 패널과 `/api/history`에 정전 1건(`endedAt` 채움), 최장 기록 유지. 탭을 모두 닫으면 `getAlarm()` null
- 무인 15분: 고장 2개(`createdAt` 역산), 정전 아님, `uptimeStartedAt` 유지. 새로고침 6번에도 2개. 이미 2개면 더하지 않음
- 옛 키만 있는 저장소: `repairs` 42·`instanceId` 유지, `base:v2` 생성, 옛 키 그대로
- main 빌드(쿼리 없는 `/ws`): 발전기 배지 표시, 다른 모듈 수리 뒤에도 발전기 고장 유지(수리 횟수만 갱신), 옛 탭의 발전기 수리 성공(`내가 고쳤어요 +1`), 새 탭에 `누군가 발전기를 고쳤어요`
- 390×844·1280×800에서 HUD·정전 배너·배지·점·패널·기록 패널·토스트 겹침 없음

성능: `?perf` 드로우콜 고장 2개 35~36, 정전+고장 3개 35~36, 정전+고장 3개+고리 37~38(예산 100). 초기 JS gzip 379.8KB(예산 600KB). fps는 swiftshader라 의미 없음, 폰 30fps는 사용자 실기 확인 대상.

## 플레이테스트 반영

출처: Preview 페르소나 플레이테스트(3명)와 neon 아트 크리틱(`facccc7`). M3 범위 안에서 한 번에 고쳤고, 서버 규칙은 1번만 바꿨다. 안개·지형 팔레트(M5)와 아바타·커서는 하지 않았다.

| # | 지적 | 바꾼 것 | 테스트 |
| --- | --- | --- | --- |
| 1 | 첫 고장까지 20~40초, 모두 그 전에 떠남 | 0→1 접속인데 고장이 0개면 `nextFaultAt = min(nextFaultAt, now + 5초)`(`FIRST_FAULT_WAIT_MS`). 접속 순간 고장을 만들지는 않으므로 새로고침은 5초 대기만 준다. 무인 60초 규칙은 그대로 | `state.test.ts` arrive 5건, `base.test.ts` 새 기지 5초·재접속 5초·두 번째 접속은 안 당김 |
| 2 | 고장 배지가 무엇을 하라는지 말하지 않음 | `⚠ 발전기 고장 · 눌러서 수리`(M2 문구), 아래 작은 줄에 센서 값. 그 모듈 패널이 열려 있으면 `· 눌러서 수리`를 뺀다. 다른 사람이 누르는 중이면 `· 누군가 고치는 중` | `labelRules.test.ts` badgeText |
| 3 | `98%`가 무슨 뜻인지 모름 | `출력 96kW · 정상 120kW`(`sensorReading`, 패널·배지). 추이 그래프에 정상값 점선, 정상 범위를 벗어난 구간(고장 쪽 방향)은 붉게. 고장 1~2개면 HUD 아래 `고장 2/3 · 3개면 정전` | `sensors.test.ts` sensorReading·isAbnormal, `sensorView.test.ts` 기준선·붉은 구간, `view.test.ts` faultCountLine |
| 4 | 폰 HUD가 4~5줄로 깨짐, 다른 사람 단서가 흐림 | 원인은 `left: 50%` 상자가 화면 절반 폭으로 줄어든 것. 좌우 16px 거터 전체 폭으로 바꿨다. ` · ` 단위로 `nowrap`, 문구 압축(`함께 고친 0회 · 3명 접속 중` / `마지막: 다른 사람 · 산소 탱크 · 25초 전`), 두 줄 대비 올림, `›` 대신 아이콘+`기록` | `view.test.ts` peopleLine·segments·lastRepairLine |
| 5 | `⚠` 점만으로 어느 모듈인지 모름 | 점에 이름(`⚠ 거주 돔`). 우선순위 규칙 유지 | `labelRules.test.ts` dotText |
| 6 | 로딩 배지 아래 `기지 정상`·가동 시간·초록 비콘·이름표 | 장면과 첫 snapshot이 모두 들어오기 전(`selectReady` = `hudReady`)에는 `기지를 불러오는 중…`만. HUD·이름표·상태등을 숨긴다. 서버를 읽을 수 없으면(업데이트 배너) 로딩에 갇히지 않는다 | `view.test.ts` hudReady, `store.test.ts` selectReady, `labelRules.test.ts` 로딩 |
| 7 | 이름표가 상태등을, 배지가 모듈 위를 덮음 | 라벨을 중심이 아니라 아래 끝으로 매단다. 이름표는 상태등 빛 위(`STATUS_LIGHT_TOP` + 0.15), 배지는 꼭대기 + 0.45(월드 단위, 모듈별 높이). 이름표 대비 올림, 상태등 빛 0.95→0.75 | 렌더링(스크린샷) |
| 8 | 온실과 거주 돔이 같은 모양 | 모듈별 클론 머티리얼에 틴트(온실 녹색 유리 `#a9e8b4`, 거주 돔 따뜻한 `#ffc890`) | 렌더링 |
| 9 | 탱크를 눌렀는데 발전기가 선택됨 | 아래 "9번 원인" | `layout.test.ts` 재현 1건 + 수정 3건, `pickTap` |
| 10 | 패널 뒤가 비침, 정상 패널이 큼 | 패널 배경 불투명, 머리 여백 축소, 정상 패널 그래프 26px(고장 40px) | 렌더링 |
| 11 | 인접 모듈 고장 링이 교차 | 링이 모델 바깥(발자국 1.1배)에서 가장 가까운 이웃까지 빈 땅의 절반까지만 퍼진다(`floorRingRange`). 두 링이 최대 크기여도 0.3 떨어진다 | `layout.test.ts` floor rings 2건 |
| 12 | 남이 고친 직후 3D에 흔적 없음 | 다른 사람의 수리면 기존 링 핑과 함께 그 모듈이 3초간 은은한 초록 발광(모듈 자신의 머티리얼 emissive라 드로우콜 +0) | `feedback.test.ts` effectsFor afterglow |

### 9번 원인

발전기 탭 상자(모델 단위 반폭 0.7×0.85, 높이 1, 배율 3 → 월드 높이 3)가 모델(높이 0.683 → 월드 2.05)보다 훨씬 컸다. 전체 보기 카메라에서 산소 탱크는 발전기 바로 뒤에 있어, 탱크 아랫부분으로 가는 광선이 발전기 상자의 뒤쪽 윗모서리를 먼저 지났다. R3F는 가장 가까운 교차 객체부터 핸들러를 부르므로(이 부분은 정상 동작) 발전기가 선택됐다. 같은 기하로 광선을 쏘는 단위 테스트에서 탱크가 보이는 표본 중 1280×800은 95/729, 390×844는 36/729가 발전기로 잡혔다.

고친 것:

- 모듈마다 탭 상자를 둘로 나눴다. `body`(GLB 경계 그대로, `MODEL_BOUNDS`)와 `margin`(손가락용 여유). 핸들러는 `e.intersections` 전체에서 가장 가까운 `body`를 고르고, 모델 밖을 눌렀을 때만 `margin`을 쓴다(`scene/tapPick.ts`). 그래서 어느 각도로 돌려도 보이는 모델이 선택된다
- 발전기 margin을 0.58×0.72·높이 0.75로, 산소 탱크 margin을 0.5·높이 0.75로 줄였다. 전체 보기에서는 margin만으로도 어긋남이 0이다
- 두 상자 모두 `visible={false}`라 드로우콜은 늘지 않는다

### 로컬 확인

`npm run build` → 레포 밖 `wrangler dev` 래퍼(저장소 조작용 `/__dev`), Playwright headless(swiftshader).

- 로딩: 모델 응답을 늦춘 폰 화면에 `기지를 불러오는 중…`만 있고 HUD·`기지 정상`·이름표가 없다
- 첫 고장: 빈 기지에 접속하고 5.2~5.5초 뒤 배지가 뜬다. 배지 `⚠ 통신탑 고장 · 눌러서 수리` + `신호 92% · 정상 94%`, HUD 아래 `고장 1/3 · 3개면 정전`
- 고장 2개: 점이 `⚠ 산소 탱크`. 패널을 열면 배지는 `⚠ 통신탑 고장`만, 패널 `신호 42% · 정상 94%`, 추이에 점선 기준선과 붉은 구간
- 폰 HUD(390): 마지막 수리 줄이 있어도, 정전 중에도 HUD 3줄(각 줄 1행), 정전 배너 1행
- 잔광: 탭 B가 고친 모듈이 탭 D에서 링 핑과 함께 옅은 초록으로 3초 남았다가 사라진다
- 9번: 1280×800·390×844 전체 보기에서 산소 탱크 아랫부분 세 점을 눌러 모두 `산소 탱크` 패널이 열린다
- 탭을 모두 닫으면 접속 0, `getAlarm()` null

성능(`?perf`): 고장 2개 35~36, 잔광 중 36, 정전+고장 3개 35~36, 정전+고리 38(예산 100, 이전과 같음). 초기 JS gzip 377KB(예산 600KB). fps는 swiftshader라 의미 없음.

검사: `format:check`·`lint`·`typecheck`·`npm test`(23 파일 300건)·`test:hooks`·`build` 통과.
