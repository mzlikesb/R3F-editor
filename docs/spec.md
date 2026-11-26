# R3F 웹 3D 데모 — 들어가야 할 기술

목표: 브라우저에서 바로 열리는 R3F 웹 3D 콘텐츠 하나에 아래 기술을 담는다.
저장소: github.com/mzlikesb/outpost
마감: **2026-12-04(금)**.

## 필수

| # | 넣을 것 |
|---|---|
| 1 | React + TypeScript + Vite |
| 2 | three.js + React Three Fiber (`@react-three/fiber`, `@react-three/drei`) |
| 3 | glTF/GLB 로딩 (`useGLTF`), 씬 구성 |
| 4 | 오브젝트 선택 + 하이라이트 (raycasting, 아웃라인/이미시브), 데이터 패널 연동 |
| 5 | 카메라 제어 (선택 시 포커스 이동), 3D 좌표계·카메라·조명·재질 |
| 6 | 씬 상태 ↔ React UI 패널 양방향 (zustand) |
| 7 | PBR 머티리얼 + 조명 (HDRI 환경맵, directional + ambient) |
| 8 | WebSocket 실시간 데이터 스트림 → 3D 오버레이, 값에 따라 색 변화 |
| 9 | REST API 연동 |
| 10 | 성능: 인스턴싱 또는 LOD, 드로우콜·FPS 표시(`gl.info.render` 기반 자체 HUD), 모바일/PC 크로스플랫폼 확인 |
| 11 | 배포: Cloudflare (WebSocket은 Worker + Durable Object). 열리는 URL이 있어야 한다 |

## 추가 — 싸게 먹히는 것만

- **Draco 압축**: `gltf-transform`으로 모델 한 번 돌리고 `DRACOLoader` 연결
- KTX2 텍스처: 여유 있으면. 없으면 버린다

## 넣지 않기로 한 것 (2026-11-26 합의)

저장/불러오기, 계정, undo/redo, 트랜스폼 기즈모 풀구현, 에셋 업로드.
범위를 키우기 시작하면 끝이 없다.

## 재료

- **github.com/mzlikesb/threejs-metaverse** (2024): 손으로 쓴 three.js.
  `Client/js/ModelLoader.js`(GLTFLoader), `environment.js`(렌더러·조명), `Controls.js`, raycasting 커밋.
  3~5번을 여기서 복기할 수 있다.
- **mr-wall-portal** (`~/projects/money/mr-wall-portal`): 인스턴싱 배칭(`src/instance-batch.ts`). 10번에 재사용.

## 순서

뼈대 + 큐브 하나 + **배포까지** 먼저 → 주소부터 살려 놓는다. 내용물은 그 다음.

