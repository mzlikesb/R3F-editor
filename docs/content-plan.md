# OUTPOST — 모두가 함께 지키는 행성 기지

## Context
`docs/spec.md`의 기술을 쓰되, 억지로 끼워 맞춘 데모가 아니라 **그 자체로 완결된 콘텐츠 하나**를 만든다.
콘셉트: 행성에 기지가 하나 있고, **접속한 사람 전원이 같은 기지를 본다.** 서버에서 모듈 고장이 나고,
누군가 수리하면 모든 사람 화면에 바로 반영된다. 기지는 사람들이 함께 살려두는 한 계속 가동된다.
→ WebSocket·서버 상태가 "보여주려고"가 아니라 콘텐츠에 진짜 필요해진다.

마감 2026-12-04(금). 저장소 github.com/mzlikesb/outpost .

**범위 원칙:** 방은 하나(로비·계정·닉네임·채팅 없음). 상호작용은 "수리" 1종. 스펙의 제외 목록(저장/계정/undo/기즈모/업로드) 유지.

## 첫 이정표 (완료: PR #9, 11/26)
**배포 URL에서 폰으로 발전기(큐브)를 수리하면 PC에서도 경고등이 꺼진다.**
모델 작업 전에 선택·패널·서버 상태가 끝까지 도는지 큐브 하나로 먼저 검증한다.

## 콘텐츠 루프
1. 접속 → `/api/base` 스냅샷으로 첫 화면, 이어서 WS 연결. 상단 HUD는 두 줄이다. 윗줄 `가동 3시간 12분`(정전 중에는 `가동 기록 끊김 · 최장 5시간`), 아랫줄 `함께 고친 7회 · 3명 접속 중`(006 C.19, #59). 폰에서 한 줄에 다 안 들어가서 둘로 나눴다
2. 센서값(발전기 kW·산소 %·온실 ℃·통신 %·기압 kPa)은 **클라이언트가 `shared/sensors.ts`로 계산**한다. 서버는 센서를 보내지 않고, 고장 상태와 시각에서 파생해 매 순간 같은 값이 나온다(006 B.8, #47). DO는 접속자가 있는 동안 20~40초 간격으로 고장을 주입한다 → 수치 악화, 모듈 붉게 펄스. **고장·선택 모듈에만** 모듈 위 drei `<Html>` 배지로 이상 수치 1줄(예: `⚠ 92℃`) → 첫 화면부터 3D 오버레이가 보임(전 모듈 상시 표시는 모바일 성능상 안 함)
3. 클릭 → 카메라가 모듈로 날아감 → 패널에 수치·추이 → [수리] 홀드. **홀드 버튼은 3D가 아닌 HTML 패널**에 둬서 카메라 제스처와 분리. 홀드 중 다른 사람이 먼저 고치면(`repaired` 메시지) 즉시 홀드 해제 + "누군가 먼저 고쳤어요" 짧은 피드백
4. 수리는 `faultId`로 서버에 전송 → **같은 고장은 한 번만 완료**(두 탭 동시 수리해도 누적 +1) → 전원에 반영, 다른 사람 수리는 링 핑으로 보임
5. 방치된 고장이 쌓이면 정전 → 조명 꺼지고 비상등. **정전 중에도 발전기는 선택·수리 가능** → 수리 시 조명 복구, 새 가동 기록 시작. "최장 가동 기록" 보존

### 상태 규칙
- **무인 시간:** alarm은 접속자가 있을 때만 걸고 0명이 되면 지운다. 다음 접속 시 마지막 저장 시각으로 경과를 계산하되 **고장은 최대 2~3개까지만 쌓이고 정전 직전에서 멈춘다** → 돌아온 사람은 "고쳐야 할 기지"를 보고, 가동 기록은 계속 쌓임
- **첫 방문 보장:** 접속 시 고장이 하나도 없으면 바로 고칠 수 있는 고장 1개를 만든다
- **중도 합류/재연결:** WS 연결 시 항상 전체 스냅샷부터 보냄
- **영구 저장(DO SQLite):** 고장 목록·가동 시작 시각·누적 수리·최장 기록·정전 이력·마지막 저장 시각만. 센서값은 저장 안 하고 고장 상태에서 파생
- **정전 집계 멱등:** alarm 재시도로 같은 정전이 두 번 기록되지 않게 정전 id/시각으로 중복 방지 ([Alarms 문서](https://developers.cloudflare.com/durable-objects/api/alarms/))
- **끊김:** 마지막 서버 상태 유지 + "재연결 중" 표시 + 수리 버튼 잠금 → 재연결 시 스냅샷 적용 후 활성화
- 메시지: 원본은 `shared/protocol.ts`다. 서버→클라 `snapshot` `fault` `repaired`(`mine`·`helped`·`helpers`) `activity`(누가 고치는 중) `presence`, 클라→서버 `repair{faultId}` `hold` `release`. 센서 메시지는 없다(위 2)

## 피드백 이펙트
깊이는 얇게, 손맛은 진하게. 1~4는 005(#45)에서 들어갔고, 5는 006(#47)의 정전·복구(비상등, 패널 불빛 순차 점등은 #54)로 들어갔다. 6~8은 아직 없는 M5 후보다. 넣는 순서:
1. **수리 홀드**: 원형 게이지 + 미세 진동 → 완료 순간 흰 플래시 + 스케일 펀치(스프링)
2. **다른 사람 수리 링 핑** + HUD 누적 수리 롤링 카운트업 — 공유 기지라는 걸 알게 해주는 연출이라 앞순위
3. **완료 버스트**: 스파크 파티클(InstancedMesh 풀) + 가산 블렌딩 글로우 스프라이트(블룸 후처리는 쓰지 않는다, 005 C.9) + `+1 REPAIR` 팝업
4. **상태 전환 색 웨이브**: 빨강→초록 복귀 시 emissive가 표면을 훑음
5. **정전/복구 연출**: 조명 소등 → 빨간 비상 회전등 → 복구 시 순차 점등
6. **카메라 셰이크**, 포커스 이동 오버슈트
7. **콤보** `x2 x3`
8. **색수차/노이즈**, (선택) 효과음 — 기본 음소거

밀리면 8→6 순으로 버림(콤보·셰이크·색수차 먼저). 1~3은 남김.
구현: `maath/easing`(스프링·보간). 후처리(Bloom·Outline)는 005 C.9에서 쓰지 않기로 했고 007에서도 유지했다. 쓸지는 M5 아트 방향 통일에서 다시 정한다. 터치 기기는 파티클 수를 절반으로 줄인다.

## 기술이 들어가는 자리
| 기술 | 자리 |
|---|---|
|React+TS+Vite, R3F+drei|기존 뼈대|
|glTF/GLB + Draco|모듈 GLB 4~5종(발전기·산소·온실·통신탑·거주 돔), `gltf-transform`로 Draco 압축, **`useGLTF(url, '/draco/')`**로 셀프호스트 디코더 지정(배포 후 Network에서 디코더 경로 확인)|
|선택+하이라이트|raycast click, 고장 시 emissive 펄스와 바닥 링(Outline 후처리는 쓰지 않는다)|
|카메라|**drei `CameraControls` 하나**로 궤도 조작 + 선택 포커스(OrbitControls 병용 안 함)|
|zustand 양방향|패널↔씬 선택, 서버 상태 → store → 씬/패널|
|PBR+조명|HDRI `Environment`, directional(그림자)+ambient, 금속/거칠기 머티리얼|
|WebSocket|DO가 기지 상태 소유, 위 메시지 규격|
|REST|`GET /api/base` 초기 스냅샷, `GET /api/history` 가동·정전 기록|
|성능|바위·소행성·태양광 패널 수천 개 `InstancedMesh`(#54·#76), LOD는 drei `Detailed` 대신 카메라–셀 경계 상자 거리 판정(셀 8개 × 2단계, #76), 자체 성능 HUD `?perf`(`gl.info.render` 드로우콜·삼각형 + FPS. `r3f-perf`는 drei 9·React 18 의존이라 제외), drei `PerformanceMonitor` 대신 자체 FPS 측정 품질 사다리(dpr·소행성 수·바깥 바위, 007 C, #53)|
|배포|**Workers Static Assets 단일 배포**: 한 Worker가 `dist/` 정적 파일 + `/api/*` + `/ws` + DO(SQLite)를 같이 서빙 → 같은 도메인이라 CORS·프록시 불필요|

## 구조
파일 목록은 `ls src/scene src/ui worker`가 원본이다. 역할 나눔만 적는다.
```
src/
  App.tsx, store.ts(zustand), sync.ts(스냅샷·시계 보정), hold.ts, feedback.ts
  scene/  BaseCanvas  Module  Ground  Rocks(큰 바위)  RockField(바위 셀·LOD)  AsteroidBelt  SolarPanels
          Sky  Lighting  EmergencyLight  CameraRig  PerfHud  QualityController  fx/(수리 연출·이름표)
  net/    socket.ts(연결·재연결·스냅샷 적용)  api.ts
  ui/     Hud  Panel  RecordPanel  BottomStack  Toast  Hint  Loading
worker/
  index.ts       /api/base, /api/history, /ws → DO
  BaseRoom.ts    DO: WebSocket Hibernation API. alarm은 `min(다음 고장 시각, 홀드 만료)` 하나만(접속자 0이면 지움),
                 무인 경과 계산, 고장 주입, repair 멱등 처리, presence·activity, 기록 저장
                 최소 방어: 존재하는 faultId만 수락, 메시지 크기 제한, 소켓당 rate limit
  state.ts holds.ts broadcast.ts rateLimit.ts   순수 로직(테스트 대상)
wrangler.jsonc   assets(dist, SPA fallback) + DO 바인딩 + SQLite migration
shared/protocol.ts   메시지 타입 (클라·워커 공용)  shared/sensors.ts   센서 계산(클라이언트가 씀)
public/models/*.glb (Draco), public/draco/, scripts/compress.sh
```
의존성 목록의 원본은 `package.json`이다. `@react-three/postprocessing`은 설치돼 있으나 쓰지 않는다(M5에서 쓰지 않으면 제거).
에셋: CC0 로우폴리 SF 팩(Kenney Space Kit 등) + Poly Haven HDRI.

## 재사용
- 별도 프로젝트 mr-wall-portal의 `src/instance-batch.ts` 인스턴싱 패턴 (배포는 Pages 대신 Workers 단일 배포로 바뀌어 portal 설정은 참고만)
- github.com/mzlikesb/threejs-metaverse raycasting/조명 코드(개념 복기)

## 순서
1. **완료 (11/26–27, PR #4)** 패키지 호환성 확인 → 뼈대 정리 + Worker 단일 배포
2. **완료 (11/26, PR #9)** ★첫 이정표: 큐브 발전기 고장 1개 + 선택 + 패널 + 수리(멱등) + 스냅샷/재연결. 하네스 체인을 정식으로 탄 첫 기능 PR. 하네스 자동화는 이 PR 뒤에 했다(플레이테스트 #30, 아트 크리틱 #41, retro #33)
3. **완료 (11/27, PR #45)** 에셋·Draco, 기지 배치, 조명·HDRI, CameraControls 포커스, 하이라이트, 수리 손맛
4. **완료 (11/27, PR #47)** 모듈 전체로 확장: 고장 주입, 무인 경과·상한, 첫 방문 보장, 정전/복구, 기록·`/api/history`(센서는 클라이언트 계산)
5. **완료 (11/27, M4 성능 마일스톤의 머지 PR)** 007 성능: 번들 예산, 품질 사다리, 패널 밭, 바위·소행성대·LOD.
6. **12/3 (M5)** 남은 이펙트(6~8) + 아트 방향 통일(팔레트·조명·안개, 후처리 여부) + README(소개·GIF·링크, 아래 "How it's built": 구조도·Draco 용량 전후·드로우콜 수치)
7. **12/4** 버퍼

## 리스크
- 멀티유저는 스펙이 경고한 'server & lobby' 함정과 가깝다 → 방 1개·위 메시지 규격 고정. 그 이상 떠오르면 중단 신호
- M5가 밀리면 버릴 순서: 이펙트 8→6(콤보·셰이크·색수차 먼저) → 후처리 도입

## Verification
- 로컬 `npm run dev` + `wrangler dev`, **탭 2개**: 한쪽 수리 → 다른 쪽 즉시 정상 복귀 / 두 탭 동시 수리 → 누적 +1만
- 수리 중 한 탭 새로고침·중도 접속 → 최신 상태로 시작
- DO storage: 탭 다 닫고 시간 지나 재접속 → 고장 2~3개, 정전 아님, 가동 기록 유지. 고장 방치 → 정전 1회만 기록 → 발전기 수리로 복구·새 기록
- WS 끊기(DevTools offline) → "재연결 중"·수리 잠금 → 복귀 시 스냅샷 적용
- Network: GLB에 `KHR_draco_mesh_compression`, 디코더가 `/draco/`에서 로드, `/api/base` 200 후 WS
- 성능 HUD: 운석 수천 개가 소수 드로우콜, 폰 실기 FPS
- 홀드 중 다른 탭에서 먼저 수리 → 홀드 즉시 해제·피드백 / 폰에서 홀드해도 카메라가 안 돌아감
- 방어: 없는 faultId·큰 메시지·연타 전송 → 무시되고 상태 안 깨짐
- 탭 다 닫으면 alarm이 멈추는지(Workers 대시보드 요청 수) 확인
- `npm run build` 통과, 배포 URL에서 PC+폰 동시 접속 동기화

> Codex 검토 메모(2026-11-26) 6개 항목 본문에 반영함. 3번의 무인 시간은 "정전 직전 상한"으로 조정.

> 네온 검토 코멘트(2026-11-26) 5개 항목 본문에 반영함.
