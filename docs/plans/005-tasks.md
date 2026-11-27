# 005 — 작업 목록

플랜: `docs/plans/005-base.md`. 작업끼리 파일이 겹치지 않게 나눈다. 경계는 인터페이스로 긋는다.

트랙 S(scene)·F(feel)·D(share)는 서로 파일이 겹치지 않아 **병렬**로 돌린다(각자 worktree, `isolation: worktree`). 리드가 결과를 `feat/005-base`로 모은다(M). 공용 파일은 리드가 뼈대를 만들어 두었고 아래 "파일 소유" 표의 주인만 고친다.

| #   | 작업                                             | 담당 | 파일                    | 완료 조건                                     | 연결 테스트                                                                                                                                  | 상태 |
| --- | ------------------------------------------------ | ---- | ----------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| T0  | 에셋 사전 확인(플랜 A.1 "먼저 확인", neon 4턴 a) | 리드 | —                       | 아래 "T0 결과"                                | —                                                                                                                                            | 완료 |
| T1  | 뼈대·인터페이스·선작성 테스트                    | 리드 | 아래 "리드가 만든 것"   | format·lint·typecheck 통과, 테스트는 의도대로 실패 | 아래 각 트랙                                                                                                                                 | 완료 |
| S   | 기지 장면·에셋 파이프라인·카메라·로딩·`?perf`    | 개발 | "파일 소유" S           | 아래 "S 수용 기준"                            | `src/scene/tap.test.ts`, `test:hooks`의 디코더 일치 검사(S가 추가)                                                                           | 완료 |
| F   | 상태 표현·손맛 연출                              | 개발 | "파일 소유" F           | 아래 "F 수용 기준"                            | (렌더링·연출이라 TDD 대상 아님. 판정은 D의 `effectsFor`를 그대로 쓴다)                                                                       | 완료 |
| D   | `mine`·판정·store·HUD·패널·토스트·힌트           | 개발 | "파일 소유" D           | 아래 "D 수용 기준"                            | `shared/protocol.test.ts`, `worker/socketId.test.ts`, `worker/test/base.test.ts`, `src/hold.test.ts`, `src/feedback.test.ts`, `src/store.test.ts`, `src/sync.test.ts`, `src/ui/view.test.ts` | 완료 |
| M   | 병합·의도 확인                                   | 리드 | —                       | 아래 "M 확인"                                 | 전체                                                                                                                                         | 완료 |

## T0 결과 (2026-11-27)

**Kenney Space Kit 2.0**(CC0, `https://kenney.nl/assets/space-kit`)을 쓴다. 다른 팩으로 바꾸지 않는다.

| 확인 항목 | 결과 |
| --- | --- |
| 모듈 5종이 한 덩어리 GLB로 있나 | 있다. 각 파일이 노드 1개·메시 1개다. 다만 메시 하나에 머티리얼별 프리미티브가 3~4개라(`metal`·`metalDark`·`metalRed`·`dark` 등 단색 머티리얼) 그대로면 모듈당 드로우콜 3~4개 |
| 빌드 타임 병합 | 된다. `gltf-transform palette --min 2`가 단색 머티리얼을 팔레트 텍스처(16×4 PNG, 111B) 하나로 합치고, `join`이 프리미티브를 하나로 합친다. 9개 파일 전부 **메시 1·프리미티브 1·머티리얼 1**(모듈당 드로우콜 1) |
| 모듈별 emissive | 된다. 병합 결과는 `MeshStandardMaterial` 하나(팔레트 `map`)라 모듈마다 `clone()`하면 emissive를 따로 바꿀 수 있다. emissive 맵이 없어 emissive는 모델 전체에 균일하게 들어간다. **대체 표현 불필요**. 단 원본 `metallicFactor`가 1이라 병합 후 기본값(metalness 1·roughness 1)이 된다. 클론할 때 metalness를 낮춘다(S) |
| 피벗 | 원본은 타일 기준 원점(예: 발전기 bbox x 1.5~2.5)이다. `gltf-transform center --pivot below`로 바닥 중심에 맞춘다 |
| `KHR_materials_unlit` | `extensionsUsed`에만 있고 실제 머티리얼에는 안 붙어 있다. 로더가 `MeshStandardMaterial`을 만든다 |
| Draco 후 용량 | 발전기 2.7KB, 산소 3.0, 온실 2.8, 통신탑 3.5, 거주 돔 2.9, 바위 3.4·3.4·2.0, 크레이터 2.3 → **GLB 합계 약 26KB** |
| 디코더 | `three@0.187.0`의 `examples/jsm/libs/draco/gltf/`에서 `draco_wasm_wrapper.js`(58KB)+`draco_decoder.wasm`(192KB)만 복사(약 251KB). JS 폴백 `draco_decoder.js`(512KB)는 WASM 없는 브라우저용이라 넣지 않는다 |
| HDRI | Poly Haven `kloofendal_48d_partly_cloudy_puresky`(CC0, Greg Zaal·Jarod Guest). 가장 작은 것이 1k(1024×512, 1.44MB, RLE RGBE)다. 512×256으로 2배 축소해 약 0.5MB로 만든다(S의 `scripts/hdr-downscale.mjs`, 의존성 없음) |
| 정적 에셋 합계 추정 | GLB 26KB + 디코더 251KB + HDRI 약 512KB ≈ **0.8MB**(예산 3MB) |
| 다운로드 재현 | Kenney는 서명된 일회용 링크다. `GET https://kenney.nl/assets/space-kit`(쿠키 저장, 브라우저 UA) → `GET https://kenney.nl/download-link/6173736574732f73706163652d6b6974`(같은 쿠키, `Referer`)의 JSON `url` → zip(6,677,531바이트). zip 안 `License.txt` 첫 줄 `Space Kit (2.0)`. Poly Haven은 고정 URL `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr`(sha256 `fd94c84997b8a3c353b62c2125a9b44e19509956986a126e472684432a02d798`) |

고른 원본(zip 안 `Models/GLTF format/`):

| 모듈 / 용도 | 원본 | 산출물 |
| --- | --- | --- |
| 발전기 | `machine_generatorLarge.glb` | `public/models/generator.glb` |
| 산소 탱크 | `machine_barrelLarge.glb` | `public/models/oxygen.glb` |
| 온실 | `hangar_roundGlass.glb` | `public/models/greenhouse.glb` |
| 통신탑 | `satelliteDish_large.glb` | `public/models/comms.glb` |
| 거주 돔 | `hangar_roundA.glb` | `public/models/habitat.glb` |
| 바위 | `rock_largeA.glb`, `rock_largeB.glb`, `rocks_smallA.glb` | `public/models/rock-a.glb`, `rock-b.glb`, `rocks-small.glb` |
| 크레이터 | `crater.glb` | `public/models/crater.glb` |

지면은 GLB 없이 코드 도형(큰 원판)으로 만든다. 발전기 원본은 1×0.68 크기로 돔(3.3×1.5)보다 작다. 가운데서 눈에 띄도록 배치 배율은 S가 정한다.

## 리드가 만든 것 (T1)

- 의존성: dev `@gltf-transform/cli@^4.5.1`(리드가 추가함. **다른 트랙은 `package.json` 의존성을 건드리지 않는다**)
- 무시 설정: `.gitignore`에 `assets-src/`, `.prettierignore`에 `public/draco`·`public/hdri`·`public/models`, `.oxlintrc.json` `ignorePatterns`에 `public/draco`
- 인터페이스(리드 소유, 고치려면 리드와 양쪽 트랙 합의): `src/modules.ts`, `src/scene/moduleTypes.ts`, `src/App.tsx`
- 빈 구현(시그니처·문서 주석만, 본문은 `throw new Error('TODO(...)')`): `worker/socketId.ts`, `src/feedback.ts`, `src/ui/view.ts`, `src/scene/tap.ts`, `src/store.ts`의 `receive`·`dispatchFeedback`·`selectFaulted`·`selectModuleStatus`, `src/hold.ts`의 `repaired` 분기
- 컴파일용 자리표시: `shared/protocol.ts` 파서와 `worker/BaseRoom.ts` 브로드캐스트가 `mine: false` 고정(TODO 주석)
- 빈 컴포넌트: `src/scene/BaseCanvas.tsx`(M1 장면을 옮겨 둠), `src/scene/fx/ModuleFx.tsx`, `src/ui/ScreenFlash.tsx`, `src/ui/Loading.tsx`, `src/ui/BottomStack.tsx`(지금은 `<Panel/>`만)
- `hold.ts`에서 `notice`·`NOTICE_MS`를 뺐다. 수리 뒤 문구는 `feedback.ts`의 토스트가 맡는다. `Panel.tsx`의 notice 표시도 뺐다

## 파일 소유

같은 파일을 두 트랙이 고치지 않는다. 표에 없는 새 파일은 자기 트랙 폴더 안에만 만든다(S: `src/scene/`(fx 제외)·`scripts/`·`public/`, F: `src/scene/fx/`, D: `src/ui/`(아래 S·F 파일 제외)·`src/net/`·`worker/`·`shared/`).

| 트랙 | 파일 |
| --- | --- |
| S | `scripts/compress.sh`(새), `scripts/hdr-downscale.mjs`(새), `scripts/draco-check.sh`(새), `package.json`(**`test:hooks` 줄만**), `CREDITS.md`, `public/models/*.glb`, `public/hdri/*`, `public/draco/*`, `src/scene/BaseCanvas.tsx`, `src/scene/Module.tsx`(새), `src/scene/` 아래 새 파일(조명·하늘·지면·바위·카메라·에러 경계·배치·`?perf`), `src/scene/tap.ts`, `src/scene/scene.css`(새), `src/ui/Loading.tsx`, `src/scene/Generator.tsx`(삭제) |
| F | `src/scene/fx/**`(`ModuleFx.tsx`와 그 아래 새 파일, `fx.css`), `src/ui/ScreenFlash.tsx` |
| D | `shared/protocol.ts`, `worker/BaseRoom.ts`, `worker/socketId.ts`, `src/hold.ts`, `src/feedback.ts`, `src/store.ts`, `src/sync.ts`, `src/net/socket.ts`, `src/ui/Hud.tsx`, `src/ui/Panel.tsx`, `src/ui/BottomStack.tsx`, `src/ui/Toast.tsx`(새), `src/ui/Hint.tsx`(새), `src/ui/view.ts`, `src/index.css` |
| 리드 | `src/modules.ts`, `src/scene/moduleTypes.ts`, `src/App.tsx`, 모든 `*.test.ts`(선작성. 개발은 테스트를 고치지 않는다. 테스트가 틀렸다고 보면 리드에게 사유를 돌려준다) |

CSS: 각 트랙은 자기 CSS 파일을 자기 컴포넌트에서 import한다(S `scene.css`, F `fx.css`, D `index.css`). `index.css`의 `.badge`·`.badge-fault`는 D가 지운다(F는 `fx-` 접두사 클래스를 쓴다).

## 트랙 사이 인터페이스

### S → F: `ModuleHandle` (`src/scene/moduleTypes.ts`)

- `scene/Module.tsx`는 모듈을 배치한 group 안에 모델(GLB 또는 대체 도형)과 `<ModuleFx id handle />`를 형제로 둔다. 모델이 마운트되면 `handle`을 만들어 넘긴다(대체 도형으로 바뀌면 새 handle)
- `handle.model`: 모델 group. F가 `scale`(펀치)만 바꾼다. S는 마운트 뒤 `scale`을 쓰지 않는다. 모듈 위치·배율은 그 바깥 group에 둔다
- `handle.materials`: 이 모듈만의 `MeshStandardMaterial` 클론. F가 `emissive`·`emissiveIntensity`를 맡는다. S는 처음에 검정·0으로 두고 다시 안 건드린다
- `handle.height`·`handle.radius`: 배지·이름표·링 위치용
- `ModuleFx`는 group 로컬 좌표(원점 = 모듈 바닥 중심)에 그린다

### D → F·S: store selector와 이벤트 (`src/store.ts`, `src/feedback.ts`)

- 상태: `useStore((s) => selectModuleStatus(s, id))` → `'fault' | 'ok'`, `useStore(selectFaulted)`
- 선택: `useStore((s) => s.selected)`(`BaseModuleId | null`). 선택은 `useStore.getState().select(id)`만 쓴다(힌트 해제가 여기에 묶여 있다)
- 수리 연출: `useStore((s) => s.feedback.effect)` → `{ outcome, seq, at } | null`. `seq`가 바뀔 때 한 번만 재생한다. 마운트 시점에 이미 있던 `seq`는 재생하지 않는다. 무엇을 재생할지는 `effectsFor(outcome)`(`sweep`·`burst`·`ringPing`)로만 정한다
- 이름: `moduleName(id)`(`src/modules.ts`)

### S ↔ D

- 빈 곳 탭: S가 `onPointerMissed`에서 `isTap`(`src/scene/tap.ts`)으로 거르고 `select(null)`을 부른다
- 모듈 탭: S의 충돌 박스가 `select(id)`를 부른다. 카메라 포커스는 S가 `selected`를 구독해서 한다(D의 `발전기 고장 — 눌러서 이동` 버튼도 `select('generator')`만 부르면 카메라가 따라간다)
- 로딩 오버레이(S)와 HUD·패널(D)은 서로 독립이다. WS 연결·패널은 로딩과 무관하게 동작한다

## S 수용 기준 (플랜 A, E)

- `scripts/compress.sh`: 위 T0의 다운로드 절차로 `assets-src/`(gitignore)에 원본을 받고, 원본마다 `center --pivot below` → `palette --min 2` → `join` → `draco` 순서로 `public/models/<산출물>.glb`를 만든다. 원본 파일 이름·다운로드 URL·버전(Space Kit 2.0, HDRI 이름·sha256)은 스크립트 안 목록과 `CREDITS.md`에 같이 적는다. `--draco`는 디코더 2개만 다시 복사한다. 내려받은 zip은 빈 임시 폴더에 두고, 필요한 파일만 `unzip -j`로 꺼낸다(zip 안의 스크립트를 실행하지 않는다)
- `scripts/hdr-downscale.mjs`: Radiance RGBE(RLE 포함)를 읽어 2×2 평균(선형 float)으로 반으로 줄여 쓴다. 의존성 없음. 산출물 `public/hdri/sky-512.hdr`(512×256)
- `scripts/draco-check.sh`: `public/draco/`의 두 파일이 `node_modules/three/examples/jsm/libs/draco/gltf/`와 바이트 단위로 같은지 본다. `package.json` `test:hooks` 끝에 붙인다
- 산출물(`public/models`·`public/hdri`·`public/draco`)은 커밋, `assets-src/`는 커밋하지 않는다. 합계 3MB 이하. 압축 전후 용량을 결과에 적는다
- `useGLTF(url, '/draco/')`로 같은 오리진에서 디코더를 받는다
- 배치: 발전기 가운데, 나머지 4개 둘레. `Module.tsx`는 `id: BaseModuleId`를 받는 공용 컴포넌트(M3에서 그대로 쓴다)
- 머티리얼: 모듈마다 클론, metalness를 낮춰(0.2~0.4) HDRI에서 형태가 보이게
- **(neon b) 지면·바위·크레이터는 `raycast`를 막는다**(`raycast={() => null}` 또는 동등). 그래서 지면을 탭해도 `onPointerMissed`가 불린다. 모듈만 보이지 않는 충돌 박스(넉넉한 크기)로 맞는다. 충돌 박스는 렌더하지 않는다(`visible={false}`도 raycast는 되는지 확인. 안 되면 `colorWrite={false}`·`depthWrite={false}` 머티리얼)
- 빈 곳 탭: `isTap`이 참일 때만 `select(null)`. 드래그로 돌리고 뗀 것은 무시
- 카메라: drei `CameraControls` 하나. 선택하면 그 모듈로 부드럽게 이동, `select(null)`이면 전체 시점. `maxPolarAngle`(지면 아래 금지)·`minDistance`·`maxDistance`·팬 범위 제한. 폰(`(max-width: 600px)`)에서는 포커스 시 시점을 위로 띄워 하단 패널에 가리지 않게
- 조명: directional(그림자 1개) + 약한 ambient + `Environment files="/hdri/sky-512.hdr"`(배경 아님, 간접광만). 배경은 어두운 하늘색 그라디언트 + 별 몇 개
- **(neon c) 로딩·에러 경계**:
  - 로딩 문구 `기지를 불러오는 중…`은 `src/ui/Loading.tsx`의 **Canvas 밖 HTML 오버레이**다(drei `useProgress`). Canvas 안 `Suspense` fallback에는 아무것도 그리지 않거나 대체 도형만 둔다
  - `Suspense`와 에러 경계는 **HDRI용 하나, 모듈마다 하나**로 나눈다. 한 GLB가 늦거나 실패해도 다른 모듈·HDRI는 따로 뜬다
  - HDRI 실패 연동: HDRI 경계의 `onError`가 `Lighting`의 상태(예: `envFailed`)를 켜고, 켜지면 directional·ambient 강도를 올린다(값은 S가 정하고 상수로 둔다). 같은 컴포넌트 안 state로 묶어 트랙 밖으로 새지 않게
  - 모듈 GLB 실패: 그 모듈만 대체 도형(발전기는 M1 큐브)으로. 대체 도형도 `ModuleHandle`을 넘겨 F의 연출과 수리가 그대로 된다
- `?perf`: 쿼리가 있을 때만 FPS·드로우콜·삼각형(`gl.info.render`)을 0.5초마다 DOM ref로 갱신. `useFrame`에서 setState·객체 생성 없음
- `Generator.tsx`는 지운다(내용은 `Module.tsx`의 발전기 대체 도형으로 옮긴다)
- 연결 테스트: `src/scene/tap.test.ts` 통과, `npm run test:hooks` 통과

## F 수용 기준 (플랜 B, C, D.11의 링 핑)

- 모두 `ModuleFx`(모듈 로컬 좌표)와 `ScreenFlash`(DOM) 안에서. 상태는 위 "D → F·S" 인터페이스로만 읽는다
- 고장: 붉은 emissive 펄스(`handle.materials`), 배지 `⚠ 발전기 고장 · 눌러서 수리`(`moduleName` 사용). 정상: emissive 0 + 은은한 녹색 상태등(작은 점 메시 하나)
- 이름표: 발전기는 늘 표시(고장이면 배지로 바뀜), 나머지는 `selected === id`일 때만. 이름표는 `pointer-events: none`. **고장 배지만 누를 수 있고** 누르면 `select('generator')`(DOM 이벤트라 캔버스 `onPointerMissed`로 새지 않는다. 그래도 `stopPropagation`)
- 바닥 링: 고장 모듈 주변에서 맥박처럼 퍼진다(고장일 때만)
- 상태 전환(`sweep`): 빨강→초록 emissive 보간 + 바닥에서 위로 훑는 링 메시 한 번. 커스텀 셰이더 없음
- 내 수리(`burst`): `ScreenFlash` 흰 플래시, `handle.model.scale` 스프링 펀치(`maath/easing`), 스파크 파티클(`InstancedMesh` 풀 하나 = 드로우콜 1, `matchMedia('(pointer: coarse)')`면 수 절반), 가산 블렌딩 글로우 스프라이트 하나. 후처리(Bloom) 쓰지 않음
- 남의 수리(`ringPing`): 바닥에 수평으로 퍼지는 물결 링
- 성능: `useFrame` 안에서 setState·`new` 금지, 지오메트리·머티리얼은 모듈 밖 상수나 `useMemo`로 재사용, 연출이 끝나면 `visible=false`로 드로우콜에서 빠진다. 연출 순간 포함 장면 전체 드로우콜 100 이하
- D·S 파일은 고치지 않는다. 앱을 띄워 보려면 D의 selector·`effectsFor` 빈 구현 때문에 오류가 난다. 확인용으로 자기 worktree에서 잠시 고쳐 볼 수는 있지만 **그 변경은 커밋하지 않는다**(커밋 전 `git diff --stat`으로 자기 파일만 있는지 확인)

## D 수용 기준 (플랜 D, B.8 힌트, D.12·13)

- 서버: 연결을 받을 때 `ws.serializeAttachment(newAttachment(() => crypto.randomUUID()))`. `repaired` 브로드캐스트는 소켓마다 `isMine(readSocketId(요청 소켓), readSocketId(받는 소켓))`로 `mine`을 넣어 따로 보낸다(브로드캐스트 함수 `broadcast`는 소켓 하나씩 부르거나 소켓별 데이터를 받게 확장. 기존 `broadcast.test.ts`는 계속 통과). DO 저장 형식은 바꾸지 않는다
- 프로토콜: `mine === true`일 때만 true
- `hold.ts`: `repaired`는 그 고장을 holding·pending 중이면 idle, 아니면 그대로
- `feedback.ts`·`store.ts`: 문서 주석과 테스트대로. `receive` 순서(분류 → hold → feedback)를 지킨다
- UI:
  - HUD 두 줄(`repairsLine` / `presenceLine` + `connectionLabel`), 숫자가 바뀌면 잠깐 커졌다 돌아오는 CSS 강조(카운트업 없음). 정상일 때 HUD 아래 `healthyLine`
  - 패널: `panelView` 결과대로. 홀드 버튼은 `repairButton`일 때만, `goToFault`면 `발전기 고장 — 눌러서 이동` 버튼(`select('generator')`)
  - `BottomStack`: `bottomStack()` 순서로 패널·`Toast`·`Hint`를 아래에서 위로 쌓는다(폰 기준. 패널이 있으면 토스트·힌트는 패널 위). 토스트 만료는 `Toast`가 `until`에 맞춘 타이머로 `dispatchFeedback({ type: 'tick' })`
  - 힌트 `고장 난 모듈을 눌러 보세요`: `hintVisible`
- 연결 테스트 전부 통과, 기존 worker 테스트 그대로 통과

## M 확인 (리드)

- 세 트랙 브랜치를 순서대로 병합: D → S → F(F가 D의 selector와 S의 handle을 실제로 쓰므로 마지막)
- `format:check`·`lint`·`typecheck`·`npm test`·`test:hooks`·`build` 통과
- 파일 소유 표 밖 변경이 없는지 `git diff --stat`으로 확인
- 의도 확인: 내 수리/남의 수리/먼저 고쳐짐 연출이 플랜 C.10 표대로 갈리는지, 빈 곳 탭·드래그·배지 탭, HDRI·GLB 실패 대체(`public/hdri` 경로를 잠시 틀리게 해서 확인), 정적 에셋 합계, `?perf` 드로우콜(정지·연출 순간)

## M 결과 (2026-11-27)

병합 순서 D → S → F(트랙별 커밋 하나씩), 그 뒤 리드 수정 커밋. 파일 소유 표 밖 변경 없음(`CREDITS.md`는 S 몫인데 비어 있어 리드가 채웠다).

리드가 고친 것:

- `Module.tsx`: `handle.height`·`radius`를 `Box3.setFromObject`(월드 좌표, 부모 행렬 갱신 여부에 따라 값이 달라짐) 대신 모델 group 자기 좌표로 계산한다. `ModuleFx`가 그리는 모듈 group 로컬 좌표와 맞는다. GLB 실패 뒤 대체 도형이 한 프레임 늦게 들어오면 배율(발전기 3배)이 두 번 걸리던 경로를 막는다. `moduleTypes.ts` 주석도 "로컬 단위"로 고쳤다
- `CameraRig.tsx`: 폰(390×844)에서 발전기를 포커스하면 모델이 화면을 꽉 채웠다. 폰 포커스 거리를 1.7배로 늘렸다
- `scene.css`: `?perf` 표시가 drei `Html fullscreen`의 transform 때문에 화면 가운데에 떴다. `position: absolute; top/left`로 왼쪽 위에 둔다

검사: `format:check`·`lint`·`typecheck` 통과, `npm test` 13파일 152개, `test:worker` 5파일 64개, `test:hooks` 52개 + `draco-check` 통과, `build` 통과.

로컬 확인(`npm run build` → `wrangler dev`, Playwright headless Chromium + SwiftShader):

| 시나리오 | 결과 |
| --- | --- |
| 탭 2개, A가 홀드 수리 | A `내가 고쳤어요 +1` + 흰 플래시, B `누군가 발전기를 고쳤어요`(플래시 없음), HUD 양쪽 0회→1회 |
| 재고장 | `발전기가 다시 고장 났어요` 토스트 + 배지 |
| 두 탭 동시 홀드 완료 | 한쪽만 `내가 고쳤어요 +1`, 다른 쪽 `누군가 먼저 고쳤어요`, HUD +1만(1→2) |
| 390×844 겹침 | HUD·배지·힌트·패널·토스트 bounding box 서로 안 겹침. 배지 탭 → 발전기 패널 열림·힌트 사라짐 |
| 드래그 후 손 떼기 / 빈 곳 탭 | 드래그 뒤 선택 유지(패널 그대로), 빈 땅 탭 → 선택 해제 |
| `/models/**` 차단 | 발전기 큐브·나머지 원기둥으로 대체, 바위 사라짐, 로딩 문구 사라짐, 수리 성공 |
| `/hdri/**` 차단 | 기본 조명(강도 올림)으로 렌더, 로딩 문구 사라짐 |
| 남의 수리 링 핑 | 폰 화면에서 바닥 물결 링 확인 |
| 오리진 | `/draco/`·`/hdri/`·`/models/` 모두 같은 오리진, 외부 요청 없음 |
| `gltf-transform inspect` | 9개 GLB 전부 `KHR_draco_mesh_compression` |

`?perf`(SwiftShader 소프트웨어 렌더라 FPS는 참고값만): 드로우콜 정지 전체 시점 31~32(그림자 패스 포함), 발전기 포커스 27, 내 수리 연출 순간 28~29, 남의 수리(폰) 28~30, 모델 차단 시 18. 삼각형 약 3.3k~4.5k. 데스크톱·폰 실기 FPS는 Preview `?perf`에서 확인한다.

용량: 정적 에셋 652,243B(GLB 9개 25,904B · HDRI 375,463B · 디코더 250,876B, 예산 3MB). 압축 전 GLB 98,164B. 초기 JS gzip 373.95KB(예산 600KB).

남은 것: 배치·배율·카메라 거리·폰 전체 시점은 눈으로 맞춘 초기값이다(`layout.ts`). 폰 전체 시점에서 거주 돔·통신탑이 화면 가장자리에 잘린다. Preview 플레이테스트에서 본다.
