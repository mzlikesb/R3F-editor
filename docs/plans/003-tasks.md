# 003 — 작업 목록

플랜: `docs/plans/003-repair.md`. 작업끼리 파일이 겹치지 않게 나눈다. 경계는 인터페이스로 긋는다.

S와 C는 동시에 진행한다. 둘이 함께 쓰는 계약은 `shared/protocol.ts`의 **타입·상수**이며 개발 리드가 이미 넣어 두었다. 바꿔야 하면 혼자 고치지 말고 개발 리드에게 올린다(반대쪽이 깨진다).

| #   | 작업                                                                          | 담당 | 파일                                                                                                                                                                               | 완료 조건                                                                                                                                                                                                                                               | 연결 테스트                                                                                                       | 상태 |
| --- | ----------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---- |
| S   | 서버: 파서·순수 규칙·DO·`/api/base`                                           | 개발 | `shared/protocol.ts`(파서 두 개만), `worker/state.ts`, `worker/broadcast.ts`, `worker/rateLimit.ts`, `worker/BaseRoom.ts`, `worker/index.ts`                                       | 연결 테스트 전부 통과, `npm run typecheck`·`lint`·`format:check` 통과. 아래 "S 세부"를 지킨다                                                                                                                                                           | `shared/protocol.test.ts`, `worker/state.test.ts`, `worker/broadcast.test.ts`, `worker/rateLimit.test.ts`, `worker/test/base.test.ts` | 대기 |
| C   | 클라이언트: 동기화·홀드·소켓·REST·장면·패널·HUD                               | 개발 | `src/sync.ts`, `src/hold.ts`, `src/net/backoff.ts`, `src/store.ts`, `src/net/socket.ts`, `src/net/api.ts`, `src/scene/Generator.tsx`, `src/ui/Panel.tsx`, `src/ui/Hud.tsx`, `src/App.tsx`, `src/index.css`, `vite.config.ts` | 연결 테스트 전부 통과, typecheck·lint·format 통과, `npm run build` 성공. 아래 "C 세부"를 지킨다. 렌더링·연출은 테스트 대상 아님                                                                                                                         | `src/sync.test.ts`, `src/hold.test.ts`, `src/net/backoff.test.ts`                                                 | 대기 |
| M   | 병합·의도 확인                                                                | 리드 | —                                                                                                                                                                                  | S·C를 PR 브랜치에 모은 뒤 전체 테스트·`npm run build` 통과, `wrangler dev` + `npm run dev`로 두 탭에서 수리가 동시에 반영되는지 확인                                                                                                                  | 전체                                                                                                              | 대기 |

C는 S가 끝나기 전에는 `parseServerMessage`가 던지므로 실제 소켓 연결을 손으로 확인할 수 없다. 순수 로직(`sync`·`hold`·`backoff`)과 화면은 먼저 끝낼 수 있다. 끝까지 붙여 보는 것은 M에서 한다.

## 계약 (S·C 공통)

`shared/protocol.ts` (타입·상수는 확정, 파서 구현은 S)

```ts
export const MAX_CLIENT_MESSAGE_BYTES = 256;        // UTF-8 바이트
export const MAX_CLIENT_MESSAGES_PER_SECOND = 5;
export const PING = 'ping';                          // JSON 아님. 서버는 setWebSocketAutoResponse로 PONG
export const PONG = 'pong';
export const PING_INTERVAL_MS = 20_000;
export const PONG_TIMEOUT_MS = 10_000;
export type ModuleId = 'generator';
export const GENERATOR: ModuleId = 'generator';

export interface Fault { id: string; moduleId: ModuleId; createdAt: number }

// 서버 -> 클라. version은 snapshot·fault·repaired에만. presence에는 없다.
export interface SnapshotMessage { type: 'snapshot'; version: number; fault: Fault | null; repairs: number; presence: number; instanceId: string }
export interface FaultMessage    { type: 'fault'; version: number; fault: Fault }
export interface RepairedMessage { type: 'repaired'; version: number; faultId: string; repairs: number }
export interface PresenceMessage { type: 'presence'; count: number }
export type ServerMessage = SnapshotMessage | FaultMessage | RepairedMessage | PresenceMessage;

// 클라 -> 서버
export interface RepairRequest { type: 'repair'; faultId: string }
export type ClientMessage = RepairRequest;

export function parseServerMessage(raw: string): ServerMessage | null;            // S 구현, C 사용
export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null; // S 구현
```

- `GET /api/base` 응답 본문은 `SnapshotMessage` JSON 그대로다(`content-type: application/json`). C는 `parseServerMessage`로 읽는다
- WS 연결 직후 첫 메시지는 항상 `snapshot`이다. 첫 방문 고장은 그 뒤 `fault`로 올 수도, `snapshot`에 담겨 올 수도 있다(둘 다 허용)
- `presence`는 접속·종료·오류 때 서버가 보낸다. 새로 들어온 소켓은 `snapshot.presence`로 받으므로 따로 받지 않아도 된다

## S 세부 (서버)

`worker/state.ts` (순수, I/O 없음)

```ts
export const REFAULT_MIN_MS = 20_000;
export const REFAULT_MAX_MS = 40_000;
export interface BaseState { fault: Fault | null; repairs: number; version: number; instanceId: string }
export interface RoomFacts { connections: number; fault: Fault | null; hasAlarm: boolean }
export type ConnectAction = 'createFault' | 'scheduleAlarm' | 'none';
export type AlarmAction = 'createFault' | 'none';

export function initialState(instanceId: string): BaseState;                       // 고장 없음, 0회, version 0
export function repair(state: BaseState, faultId: string): BaseState;             // 다르면 같은 참조 반환
export function ensureFault(state: BaseState, now: number, newId: () => string): BaseState; // 있으면 같은 참조
export function shouldFirstVisitFault(f: RoomFacts): boolean;   // connections === 1 && 고장 없음 && 예약 없음
export function needsSelfHeal(f: RoomFacts): boolean;           // connections > 0 && 고장 없음 && 예약 없음
export function decideOnConnect(f: RoomFacts): ConnectAction;   // 첫 방문 > 자가 복구 > none
export function decideOnAlarm(f: Pick<RoomFacts, 'connections' | 'fault'>): AlarmAction; // 자가 복구 분기 없음
export function nextFaultDelayMs(rand: () => number): number;   // [20000, 40000]
export function countPresence<T>(sockets: readonly T[], closing?: T): number;
export function toSnapshot(state: BaseState, presence: number): SnapshotMessage;
```

`worker/broadcast.ts`: `broadcast(sockets: Iterable<SocketLike>, data: string): number` — 소켓마다 try/catch, 실패한 소켓은 `close`(close가 던져도 삼킴), 성공 수 반환.

`worker/rateLimit.ts`: `createRateLimiter(limit = 5, windowMs = 1000): (now: number) => boolean` — 소켓마다 하나. 고정·슬라이딩 창 어느 쪽이든 된다. 하이버네이션으로 메모리가 비면 초기화돼도 괜찮다.

`BaseRoom` 동작

- 저장: `BaseState` 한 객체를 키 하나에 `ctx.storage.put`. 처리 순서는 계산 → `put` 완료 → 브로드캐스트. `put`이 실패하면 보내지 않는다
- 예약의 기준은 `ctx.storage.getAlarm()` 하나. `hasAlarm = (await getAlarm()) !== null`
- 연결: 소켓 수락 → 그 소켓에 `snapshot`(presence 포함) → 다른 소켓에 `presence` → `decideOnConnect` 결과대로 고장 생성(저장 후 `fault` 브로드캐스트) 또는 `setAlarm(now + nextFaultDelayMs)`
- 메시지: rate limit → `parseClientMessage` → `repair` → 바뀌었으면 저장 후 `repaired` 브로드캐스트 → 새 상태로 `needsSelfHeal`이면 `setAlarm`. 수리 성공 뒤의 재고장 예약도 이 한 줄로 걸린다
- `alarm()`: `decideOnAlarm`이 `createFault`일 때만 고장 생성·저장·`fault` 브로드캐스트. 재예약하지 않는다
- 종료·오류: `countPresence(ctx.getWebSockets(), ws)`로 닫히는 소켓을 빼고 `presence` 브로드캐스트
- 생성자에서 `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))`
- `fetch`: `/api/base`(GET)면 `Response.json(toSnapshot(state, getWebSockets().length))`, 아니면 기존처럼 WS 업그레이드(아니면 426)
- `worker/index.ts`: `/api/base`도 같은 DO로 넘긴다
- 기존 002의 `instanceId` 키(`'instanceId'`)가 있으면 그 값을 새 상태의 `instanceId`로 가져와도 되고 새로 만들어도 된다(테스트 안 함. production DO에 남아 있는 값이라 가져오는 쪽을 권장)

## C 세부 (클라이언트)

`src/sync.ts` (순수)

```ts
export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';
export interface BaseView { fault: Fault | null; repairs: number; version: number; instanceId: string }
export interface SyncState { base: BaseView | null; presence: number; wsSynced: boolean }
export const initialSync: SyncState;
export function applyServerMessage(state: SyncState, msg: ServerMessage): SyncState; // 낮은 version 버림, presence는 항상 덮음
export function applyRestSnapshot(state: SyncState, snap: SnapshotMessage): SyncState; // wsSynced면 무시
export function canRepair(state: SyncState, connection: ConnectionStatus): boolean;   // open && wsSynced && 고장 있음
```

`src/hold.ts` (순수)

```ts
export const HOLD_MS = 1000, PENDING_TIMEOUT_MS = 5000, NOTICE_MS = 3000;
export type HoldState =
  | { kind: 'idle' }
  | { kind: 'holding'; faultId: string; startedAt: number }
  | { kind: 'pending'; faultId: string; sentAt: number };
export interface Notice { kind: 'success' | 'beaten'; until: number }
export interface RepairUi { hold: HoldState; notice: Notice | null }
export const initialRepairUi: RepairUi;
export type HoldEvent =
  | { type: 'press'; faultId: string; now: number }
  | { type: 'release'; now: number }      // pointerup
  | { type: 'cancel'; now: number }       // 버튼 영역 이탈(pointermove + getBoundingClientRect), pointercancel, blur, visibilitychange(hidden)
  | { type: 'disconnect'; now: number }
  | { type: 'repaired'; faultId: string; now: number }
  | { type: 'snapshot'; now: number }
  | { type: 'tick'; now: number };        // 홀드 완료·pending 시간 초과·안내 숨김
export interface HoldResult { ui: RepairUi; send: RepairRequest | null }
export function reduceHold(ui: RepairUi, event: HoldEvent): HoldResult;
export function holdProgress(hold: HoldState, now: number): number; // 0..1
```

전이: `idle --press--> holding --tick(>=1s), send--> pending --repaired(내 id)--> idle + success`. `holding`에서 release·cancel·disconnect → 조용히 idle. `holding`에서 repaired → idle + beaten(3초). `pending`에서 release·cancel은 무시, 5초 시간 초과·snapshot → idle(안내 없음). `idle`에서 repaired는 아무 일 없음.

`src/net/backoff.ts`: `reconnectDelayMs(attempt: number, rand?: () => number): number` — 지수 증가, 최대 10초.

배선(테스트 없음, M에서 손으로 확인)

- `src/store.ts`(zustand): `SyncState` + `connection` + `selected: ModuleId | null` + `RepairUi`. 위 순수 함수만 불러 상태를 바꾼다. 기지 상태를 클라가 직접 바꾸지 않는다
- `src/net/socket.ts`: `/ws` 연결. 소켓이 열려도 `snapshot`을 적용한 뒤에야 `connection = 'open'`. 끊기면 `reconnecting` + hold에 `disconnect`, `reconnectDelayMs`로 재연결. `PING_INTERVAL_MS`마다 `PING`, `PONG_TIMEOUT_MS` 안에 `PONG`이 없으면 닫고 재연결. `PONG`·`PING` 프레임은 `parseServerMessage`에 넘기지 않는다. `repaired`·`snapshot`을 받으면 store 반영 후 hold에도 이벤트를 넣는다. hold의 `send`가 나오면 `RepairRequest`를 보낸다
- `src/net/api.ts`: 시작 시 `GET /api/base` 한 번 → `applyRestSnapshot`. 실패는 조용히 무시
- `src/scene/Generator.tsx`, `src/ui/Panel.tsx`, `src/ui/Hud.tsx`, `src/App.tsx`: 플랜 "클라이언트" 절대로. 패널 길게 누르기 방어(`touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`, `contextmenu` 차단), 배지 `pointer-events: none`, 홀드 중 카메라가 돌지 않게
- `vite.config.ts`: `/api`도 `http://localhost:8787`로 프록시
- 새 의존성 금지(`zustand`, `@react-three/drei`는 이미 있음)
