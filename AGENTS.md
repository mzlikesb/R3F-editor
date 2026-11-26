# OUTPOST — 에이전트 규칙

행성에 기지가 하나 있고, 접속한 사람 전원이 같은 기지를 본다. 서버에서 모듈이 고장 나고 누군가 수리하면 모든 화면에 바로 반영된다. 기지는 사람들이 함께 살려두는 한 계속 가동된다. React Three Fiber / TypeScript / Vite 클라이언트, Cloudflare Worker + Durable Object 서버(단일 Worker 배포). 이 파일이 모든 에이전트(Claude Code, Codex, Gemini CLI)의 단일 규칙 원본이다.

## 명령어

- `npm run dev` — Vite 개발 서버
- `npm run build` / `npm run preview`
- `npm run format` / `npm run format:check` — Prettier
- `npm run lint` — oxlint
- `npm run typecheck`
- `npm test` — 전체 테스트 / `npm run test:worker` — Worker·DO 테스트
- `npm run deploy` — production 배포 / `npm run deploy:preview` — Preview 배포
- `npx wrangler dev` — Worker + Durable Object 로컬 실행
- Node 버전은 `.nvmrc`(26)

## 먼저 읽을 문서

| 문서                   | 언제                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `docs/content-plan.md` | 작업 전 항상. 콘텐츠 루프, 범위, 순서, 리스크                        |
| `docs/spec.md`         | 기술 스펙과 제외 목록이 필요할 때                                    |
| `docs/plans/NNN-*.md`  | 진행 중인 PR의 플랜·작업 목록(`NNN-tasks.md`)·QA 리포트(`NNN-qa.md`) |
| `docs/templates/`      | 플랜·작업 목록·QA 리포트를 새로 쓸 때                                |
| `docs/retro.md`        | 같은 문제가 반복되는지 볼 때                                         |

범위: 방은 하나, 상호작용은 "수리" 1종. 저장/계정/undo/기즈모/업로드는 넣지 않는다. 범위를 넓히자는 안이 나오면 중단 신호다.
README·UI·커밋 메시지는 작품 자체로 설명한다. 만든 목적이나 용도는 적지 않는다.

## 워크플로우

```
브랜치 생성 → docs/plans/NNN-*.md 작성 → draft PR
  → 플랜 리뷰: Codex(웹) + neon(Gemini) → 사용자   (최대 3턴, 결론은 사용자가 냄)
  → 승인(plan-approved 라벨)
  → 개발 리드(Opus): 작업 분할(tasks.md) + 테스트 먼저 작성 (서버 로직·UI 로직만)
  → 개발(Sonnet): 구현
  → QA(Opus): 명세 대비 검증, 실패 시 개발로 반려
  → Preview/staging 배포 → 플레이테스트 (기능 PR부터)
  → PR ready → 최종 SHA에 코드 리뷰: Codex(웹) → 사용자
  → 사용자 "리뷰 끝났어" → 반영 → CI 통과
  → 사용자가 최종 커밋 확인 후 user-approved 라벨
  → small: auto-merge / large: 사용자 머지 → main 머지 시 production 자동 배포
```

- PR 등급: **small**(CI·pr-check·Codex 리뷰·사용자 승인 후 auto-merge), **large**(플랜 승인·QA·사용자 머지). 등급은 `size:small` / `size:large` 라벨과 PR 본문에 적는다
- **small은 플랜 문서·`tasks.md`·QA 리포트를 생략**하고 `stage:code-review`로 시작한다. 변경 이유와 검증 결과는 PR 본문에 쓴다. 쓰다가 커지면 large로 바꾸고 플랜부터 쓴다
- 머지는 등급과 관계없이 **squash**로 한다(검증용 임시 커밋이 main에 남지 않는다)
- 훅(`scripts/hooks/guard-bash.sh`)은 실수 방지 장치다. 같은 사용자 계정을 쓰므로 보안 경계가 아니다. 우회하지 않는다
- 리뷰는 최대 **3턴**. 3턴을 넘으면 멈추고 사용자를 부른다
- **TDD는 서버 로직과 UI 로직만.** 개발 리드가 테스트를 먼저 쓰고 개발이 통과시킨다. 그 외(렌더링·연출)는 테스트를 강제하지 않는다
- 에이전트끼리 대화는 공유하지 않는다. 플랜·tasks·qa 리포트·PR 코멘트 파일만이 인수인계 수단이다

### 역할

| 역할        | 모델       | 하는 일                                                                                              | 사용자와           |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------------- | ------------------ |
| 기획/디자인 | Opus 5.5   | 플랜 작성, 콘텐츠·UX 결정, 리뷰 반영, neon 호출                                                      | 유일하게 직접 대화 |
| 개발 리드   | Opus 5.5   | `tasks.md` 작업 분할, 테스트 선작성, 개발 worktree 결과를 PR 브랜치로 모음, 구현이 의도대로인지 판단 | —                  |
| 개발        | Sonnet 5.5 | 작업 단위 구현, 테스트 통과                                                                          | —                  |
| QA          | Opus 5.5   | 플랜·명세 대비 검증, 버그 리포트(이슈)                                                               | 결과만 보고        |

개발 에이전트를 **병렬로** 돌릴 때만 작업마다 worktree를 따로 만든다. 순차 작업은 PR worktree 하나를 재사용한다.

### 리뷰 기록

같은 PR에서 플랜 리뷰 뒤 구현이 이어지므로, 각 리뷰가 어느 커밋을 봤는지 남긴다.

- 리뷰는 **PR 코멘트**로 남긴다(파일 안에 쓰지 않는다)
- PR 본문의 `리뷰 기록` 표: `단계 · 리뷰어 · 대상 SHA · 판정`. 리뷰가 끝날 때마다 담당 에이전트가 한 줄 추가
- ready 전환 시 최종 SHA로 `@codex review`를 요청한다. 지적 반영으로 코드가 바뀌면 그 SHA도 리뷰됐는지 머지 전에 확인
- neon이 한도·CLI 오류로 못 돌면 `skipped(사유)`로 기록하고 다음 단계로 진행한다

### 승인과 머지

모든 PR을 사용자 계정으로 열기 때문에 GitHub의 필수 Approve는 본인이 충족할 수 없다. 승인은 라벨로 한다.

- 브랜치 보호(main): 필수 체크 `ci`, `pr-check`, `user-approval`. Approve 필수는 끈다
- **`user-approved` 라벨은 사용자만 단다.** 에이전트는 이 라벨을 달지 않는다(달려는 명령은 훅이 막는다)
- 새 커밋이 올라오면 워크플로우가 `user-approved`를 자동으로 떼고 코멘트를 남긴다 → 승인은 항상 최종 커밋 기준
- `user-approval` 체크는 라벨이 있을 때만 통과
- small: `size:small` + `user-approved` + ready(draft 아님)가 모두 맞으면 auto-merge. large: 사용자가 직접 머지
- 승인 후 등급을 large로 바꾸거나, `user-approved`를 떼거나, draft로 되돌리면 auto-merge 예약이 해제된다
- auto-merge는 `AUTOMERGE_TOKEN`(fine-grained PAT)으로 켠다

## 규칙

### 코드 컨벤션

- 기준: [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html). 아래는 이 프로젝트에서 다르게 하거나 덧붙이는 점만
- 도구로 강제한다: Prettier(포맷), oxlint(typescript·react 규칙), `tsconfig` strict. CI에서 실패시킨다
- React·R3F: 함수형 컴포넌트 + named export, 훅 규칙 준수, `useFrame` 안에서 setState·객체 생성 금지, 지오메트리·머티리얼 재사용
- 브랜치 `feat|fix|chore/NNN-이름`, 커밋은 Conventional Commits

### 구조·소유권

- `scene/`은 그리기, `net/`은 통신, `ui/`는 패널. 메시지 타입은 `shared/protocol.ts` 한 곳
- 기지 상태의 주인은 서버(DO). 클라이언트는 상태를 직접 바꾸지 않고 요청만 보낸다
- 플랜에 없는 의존성은 추가하지 않는다

### 성능 예산 (유연하게)

- 잠정치: 데스크톱 60fps, 중급 폰 30fps 이상, 드로우콜 100 이하, 초기 JS 번들 gzip 600KB 이하
- 첫 이정표 뒤 실측 기준선으로 확정한다. 확정 전 CI는 경고만, 확정 후 번들 크기는 실패 처리
- 예산 초과 PR은 이유를 본문에 적으면 사용자 판단으로 통과 가능

### 에셋

- CC0 등 출처가 분명한 것만 쓰고 `CREDITS.md`에 기록한다
- GLB는 Draco 압축 필수(`scripts/compress.sh`). 원본은 커밋하지 않는다

### 멈추고 사용자를 부르는 조건

작업을 멈추고 PR 코멘트 + herdr 알림으로 사용자를 부른다. 그다음은 사용자가 정한다.

- 같은 테스트를 세 번 고쳐도 실패
- 작업 범위가 플랜 밖으로 넓어짐
- 리뷰어 의견 충돌, 리뷰 3턴 초과
- 시크릿·배포 설정·DO 스키마·결제 관련 변경
- 되돌릴 수 없는 작업(데이터 삭제, force push, 프로덕션 롤백 등)

### 완료 기준 (Definition of Done)

- **small**: CI + pr-check 통과, Codex 리뷰, 사용자 `user-approved` → auto-merge
- **large**: 위 + 플랜 승인 + QA 통과 + (플레이 가능한 기능이 있는 PR이면) staging 플레이테스트 + 사용자 머지
- 플레이테스트·아트 평가는 수리가 가능한 첫 기능 PR부터 적용한다. 그 전 PR은 화면이 뜨고 연결되는지만 검증한다
- 공통: 테스트 대상(서버 로직·UI 로직)은 테스트가 있다, 성능 예산 확인 결과를 PR 본문에 적는다, 리뷰 기록 표가 채워져 있다

### 이슈·라벨·마일스톤

- QA 버그·플레이테스트 지적은 GitHub Issues로 올린다. 기획 에이전트가 묶고 우선순위를 제안하고, 처리 여부는 사용자가 정한다
- **이슈를 처리하는 PR은 본문에 이슈를 링크한다**: `- 관련 이슈: Closes #N` / `Refs #N`. 없으면 `없음`. pr-check가 강제
- **모든 PR·이슈에 라벨과 마일스톤.** PR은 `size:*` 1개 + `stage:*` 1개 + 마일스톤 필수. pr-check가 강제. 단계 라벨은 에이전트가 단계를 넘길 때 바꾼다
- 라벨: `size:small` `size:large` `stage:plan-review` `stage:dev` `stage:qa` `stage:playtest` `stage:code-review` `plan-approved` `user-approved` `bug` `playtest` `art-ux` `quality`
- 마일스톤: M0 하네스 ~ M5 출시

### 시크릿·환경변수

- 로컬은 `.dev.vars`(gitignore), 필요한 키 목록은 `.dev.vars.example`
- CI는 GitHub Secrets(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AUTOMERGE_TOKEN`). 시크릿 값은 문서·로그·PR에 남기지 않는다

### 배포·롤백

- PR Preview 또는 단일 `staging`. 단일 `staging`이면 `deploy.yml`의 `concurrency` 그룹으로 동시 배포를 막고, `stage:playtest` PR은 한 번에 하나만
- main 머지 시 production 자동 배포
- 프로덕션 문제 시 `npx wrangler rollback`(사용자 승인 후). DO 스키마 변경이 낀 배포는 롤백 전 사용자와 확인

### 회고

- PR 머지 때마다 기획 에이전트가 `docs/retro.md`에 한 줄 남긴다
- 같은 문제가 두 번 나오면 규칙화를 제안하고, 사용자가 승인하면 이 파일에 추가한다. 예외 처리 규칙은 이렇게만 늘린다

## 병렬 세션 규칙

여러 세션이 이 저장소에서 동시에 작업한다. git 인덱스는 폴더 단위로 공유되므로, 파일이 겹치지 않아도 `git add .` 하나로 남의 작업이 딸려 들어간다.

1. **메인 체크아웃은 읽기 전용** — 조회·grep·`git log`만. 브랜치 전환·커밋·리셋 금지
2. **모든 브랜치 작업은 전용 worktree에서**: `git worktree add ../outpost-<주제> -b <브랜치> origin/main` → 작업 → PR → `git worktree remove`. worktree 안에서 `npm ci`를 따로 한다
3. **착수 전 클레임**: 브랜치를 먼저 push해서 자리를 잡고 시작한다. `git worktree list`와 `git branch -r`로 다른 세션의 작업 위치를 먼저 확인한다
4. **남의 것 불가침**: 내가 만들지 않은 브랜치·미커밋 변경·worktree는 건드리지 않는다(리셋·체크아웃·스태시 금지). 이상하면 사용자에게 보고한다
5. **머지 후 rebase**: 내 브랜치가 오래되면 `git fetch && git rebase origin/main`

나누는 기준:

- 동시에 쓴다 → 브랜치와 worktree를 각각 나눈다
- 순차로 한다 → 하나로 충분하다. worktree를 만들지 않는다
- 읽기만 한다 → 메인 체크아웃을 공유해도 된다
- 경계는 파일이 아니라 **인터페이스**로 긋는다. 한쪽이 함수·타입을 노출하고 다른 쪽이 호출하는 형태로 자른다

## Review guidelines

Codex 웹 리뷰가 이 절을 읽는다. 모든 리뷰어 공통 출력 형식:

1. **판정**: 승인 / 수정 요청
2. **막는 문제**: 머지 전에 반드시 고쳐야 하는 것
3. **제안**: 막지는 않지만 고치면 좋은 것
4. **질문**: 의도를 확인해야 하는 것

각 항목에 근거 위치를 붙인다(`파일:줄` 또는 플랜 절). 근거 없는 지적은 쓰지 않는다.

중점 확인:

- **서버 상태 멱등성**: 같은 `faultId` 수리가 한 번만 반영되는가, alarm 재시도·재연결·중복 메시지에도 상태가 깨지지 않는가
- **테스트 유무**: 서버 로직·UI 로직 변경에 테스트가 있는가
- **범위 이탈**: 플랜에 없는 기능·의존성·파일이 들어왔는가
- **모바일 성능**: `useFrame` 안 할당, 드로우콜, 번들 크기, 후처리 비용
- **이슈 링크·라벨·마일스톤**: 본문 `관련 이슈`, `size:*`·`stage:*` 라벨, 마일스톤이 있는가
