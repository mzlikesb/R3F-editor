# OUTPOST — 모두가 함께 지키는 행성 기지

## Context
`docs/spec.md`의 기술을 쓰되, 억지로 끼워 맞춘 데모가 아니라 **그 자체로 완결된 콘텐츠 하나**를 만든다.
콘셉트: 행성에 기지가 하나 있고, **접속한 사람 전원이 같은 기지를 본다.** 서버에서 모듈 고장이 나고,
누군가 수리하면 모든 사람 화면에 바로 반영된다. 기지는 사람들이 함께 살려두는 한 계속 가동된다.
→ WebSocket·서버 상태가 "보여주려고"가 아니라 콘텐츠에 진짜 필요해진다.

마감 2026-12-04(금). 저장소 github.com/mzlikesb/outpost (스캐폴드 삭제 후 빈 상태, 환경은 하네스 세팅 PR에서 새로 구성).

**범위 원칙:** 방은 하나(로비·계정·닉네임·채팅 없음). 상호작용은 "수리" 1종. 스펙의 제외 목록(저장/계정/undo/기즈모/업로드) 유지.

## 첫 이정표 (11/28까지)
**배포 URL에서 폰으로 발전기(큐브)를 수리하면 PC에서도 경고등이 꺼진다.**
모델 작업 전에 선택·패널·서버 상태가 끝까지 도는지 큐브 하나로 먼저 검증한다.

## 콘텐츠 루프
1. 접속 → `/api/base` 스냅샷으로 첫 화면, 이어서 WS 연결. 상단은 누적 기록 우선: "가동 312시간 · 누적 수리 1,204회 · 지금 접속 N명"
2. 접속자가 있는 동안 DO가 **2~3초마다** 모듈별 센서값(온도·전력·O₂) 브로드캐스트(클라에서 보간해 부드럽게 표시), 간헐적으로 고장 주입 → 수치 악화, 모듈 붉게 펄스. **고장·선택 모듈에만** 모듈 위 drei `<Html>` 배지로 이상 수치 1줄(예: `⚠ 92℃`) → 첫 화면부터 3D 오버레이가 보임(전 모듈 상시 표시는 모바일 성능상 안 함)
3. 클릭 → 카메라가 모듈로 날아감 → 패널에 수치·추이 → [수리] 홀드. **홀드 버튼은 3D가 아닌 HTML 패널**에 둬서 카메라 제스처와 분리. 홀드 중 다른 사람이 먼저 고치면(`event(repair)`) 즉시 홀드 해제 + "누군가 먼저 고쳤어요" 짧은 피드백
4. 수리는 `faultId`로 서버에 전송 → **같은 고장은 한 번만 완료**(두 탭 동시 수리해도 누적 +1) → 전원에 반영, 다른 사람 수리는 링 핑으로 보임
5. 방치된 고장이 쌓이면 정전 → 조명 꺼지고 비상등. **정전 중에도 발전기는 선택·수리 가능** → 수리 시 조명 복구, 새 가동 기록 시작. "최장 가동 기록" 보존

### 상태 규칙
- **무인 시간:** 틱은 접속자 있을 때만. 다음 접속 시 마지막 저장 시각으로 경과를 계산하되 **고장은 최대 2~3개까지만 쌓이고 정전 직전에서 멈춘다** → 돌아온 사람은 "고쳐야 할 기지"를 보고, 가동 기록은 계속 쌓임
- **첫 방문 보장:** 접속 시 고장이 하나도 없으면 바로 고칠 수 있는 고장 1개를 만든다
- **중도 합류/재연결:** WS 연결 시 항상 전체 스냅샷부터 보냄
- **영구 저장(DO SQLite):** 고장 목록·가동 시작 시각·누적 수리·최장 기록·정전 이력·마지막 저장 시각만. 센서값은 저장 안 하고 고장 상태에서 파생
- **정전 집계 멱등:** alarm 재시도로 같은 정전이 두 번 기록되지 않게 정전 id/시각으로 중복 방지 ([Alarms 문서](https://developers.cloudflare.com/durable-objects/api/alarms/))
- **끊김:** 마지막 서버 상태 유지 + "재연결 중" 표시 + 수리 버튼 잠금 → 재연결 시 스냅샷 적용 후 활성화
- 메시지: 서버→클라 `snapshot` `sensors` `event(fault/repair/blackout/restore)` `presence`, 클라→서버 `repair{faultId}`

## 피드백 이펙트 (후순위, 코어 완성 후)
깊이는 얇게, 손맛은 진하게. 넣는 순서:
1. **수리 홀드**: 원형 게이지 + 미세 진동 → 완료 순간 흰 플래시 + 스케일 펀치(스프링)
2. **다른 사람 수리 링 핑** + HUD 누적 수리 롤링 카운트업 — 공유 기지라는 걸 알게 해주는 연출이라 앞순위
3. **완료 버스트**: 스파크 파티클(InstancedMesh 풀) + 블룸 순간 강화 + `+1 REPAIR` 팝업
4. **상태 전환 색 웨이브**: 빨강→초록 복귀 시 emissive가 표면을 훑음
5. **정전/복구 연출**: 조명 소등 → 빨간 비상 회전등 → 복구 시 순차 점등
6. **카메라 셰이크**, 포커스 이동 오버슈트
7. **콤보** `x2 x3`
8. **색수차/노이즈**, (선택) 효과음 — 기본 음소거

밀리면 8→6 순으로 버림(콤보·셰이크·색수차 먼저). 1~3은 남김.
구현: `maath/easing` 또는 `@react-spring/three`, 후처리는 `@react-three/postprocessing`(Bloom 등). 모바일은 후처리 축소.

## 기술이 들어가는 자리
| 기술 | 자리 |
|---|---|
|React+TS+Vite, R3F+drei|기존 뼈대|
|glTF/GLB + Draco|모듈 GLB 4~5종(발전기·산소·온실·통신탑·거주 돔), `gltf-transform`로 Draco 압축, **`useGLTF(url, '/draco/')`**로 셀프호스트 디코더 지정(배포 후 Network에서 디코더 경로 확인)|
|선택+하이라이트|raycast hover/click, Outline(postprocessing), 고장 시 emissive 펄스|
|카메라|**drei `CameraControls` 하나**로 궤도 조작 + 선택 포커스(OrbitControls 병용 안 함)|
|zustand 양방향|패널↔씬 선택, 서버 상태 → store → 씬/패널|
|PBR+조명|HDRI `Environment`, directional(그림자)+ambient, 금속/거칠기 머티리얼|
|WebSocket|DO가 기지 상태 소유, 위 메시지 규격|
|REST|`GET /api/base` 초기 스냅샷, `GET /api/history` 가동·정전 기록|
|성능|운석·바위·태양광 패널 수천 개 drei `Instances`, LOD(`Detailed`), 자체 성능 HUD 토글(`gl.info.render` 드로우콜·삼각형 + FPS. `r3f-perf`는 drei 9·React 18 의존이라 제외), `PerformanceMonitor` dpr 적응, 모바일은 Outline 끄고 emissive만|
|배포|**Workers Static Assets 단일 배포**: 한 Worker가 `dist/` 정적 파일 + `/api/*` + `/ws` + DO(SQLite)를 같이 서빙 → 같은 도메인이라 CORS·프록시 불필요|

## 구조
```
src/
  App.tsx, store.ts(zustand)
  scene/  Base.tsx  Module.tsx  Asteroids.tsx  Lights.tsx  CameraRig.tsx  Effects.tsx
  net/    socket.ts(연결·재연결·스냅샷 적용)  api.ts
  ui/     Panel.tsx  Hud.tsx(누적 기록·접속자·연결 상태·perf 토글)
worker/
  index.ts       /api/base, /api/history, /ws → DO
  BaseRoom.ts    DO: WebSocket Hibernation API, 틱(접속자 있을 때만 2~3초 alarm, 0명이면 alarm 중단),
                 무인 경과 계산, 고장 주입, repair 멱등 처리, presence, 기록 저장
                 최소 방어: 존재하는 faultId만 수락, 메시지 크기 제한(~256B), 소켓당 rate limit(초당 몇 회)
wrangler.jsonc   assets(dist, SPA fallback) + DO 바인딩 + SQLite migration
shared/protocol.ts   메시지 타입 (클라·워커 공용)
public/models/*.glb (Draco), public/draco/, scripts/compress.sh
```
추가 의존성: `zustand`, `@react-three/postprocessing`, `maath`; dev: `@gltf-transform/cli`, `wrangler`.
에셋: CC0 로우폴리 SF 팩(Kenney Space Kit 등) + Poly Haven HDRI.

## 재사용
- `~/projects/money/mr-wall-portal/src/instance-batch.ts` 인스턴싱 패턴 (배포는 Pages 대신 Workers 단일 배포로 바뀌어 portal 설정은 참고만)
- github.com/mzlikesb/threejs-metaverse raycasting/조명 코드(개념 복기)

## 순서
1. **11/26–27** **패키지 호환성 먼저 확인**(최신 스택 react 19.3·R3F 9.8·drei 10.7·three 0.187·vite 8.3·ts 7.0에 `@react-three/postprocessing`·`maath`·`zustand` 설치 + `npm run build` 통과) → 뼈대 정리 + Worker 단일 배포(정적 + DO WS 에코)
2. **11/28** ★첫 이정표: 큐브 발전기 고장 1개 + 선택 + 패널 + 수리(멱등) + 스냅샷/재연결 → 폰↔PC 동기화 확인. **하네스 체인을 정식으로 타는 첫 기능 PR.** 하네스 자동화(002: 플레이테스트·스킬·상태줄)는 수리 화면이 생긴 이 PR 뒤에 한다
3. **11/29** 에셋·Draco, 기지 배치, 조명·HDRI, CameraControls 포커스, 하이라이트
4. **11/30–12/1** 모듈 전체로 확장: 센서 틱, 고장 주입, 무인 경과·상한, 첫 방문 보장, 정전/복구, 기록·`/api/history`
5. **12/2** 운석 인스턴싱·LOD·perf·모바일 분기, 실기 확인
6. **12/3** 이펙트 1→8 + 아트 방향 통일(팔레트·조명·블룸·안개) + README(소개·GIF·링크, 아래 "How it's built": 구조도·Draco 용량 전후·드로우콜 수치)
7. **12/4** 버퍼

## 리스크
- 멀티유저는 스펙이 경고한 'server & lobby' 함정과 가깝다 → 방 1개·위 메시지 규격 고정. 그 이상 떠오르면 중단 신호
- DO가 11/28까지 안 뚫리면 그때만 `socket.ts`에 로컬 시뮬 폴백 추가해 프론트 진행 (기본은 안 만듦)
- 밀리면 버릴 순서: 이펙트 8→4 → LOD → `/api/history` → 추이 그래프

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
