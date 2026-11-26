# 002 — 승인 신원 분리

- 브랜치: `chore/002-identity`
- 등급: **large** (사용자 머지)
- 관련 이슈: Closes #2
- 마일스톤: M0 하네스
- 상태: 플랜 리뷰 3턴(마지막)

## Context
지금은 PR을 사용자 계정(`mzlikesb`)으로 열고, 에이전트도 같은 계정 권한으로 움직인다. 본인 PR은 본인이 Approve할 수 없어서 승인을 `user-approved` 라벨로 대신했다.
이 라벨은 훅이 에이전트의 부착을 막는 "약속"일 뿐이다. 이슈 #2에서 변수·GraphQL로 훅을 우회할 수 있다는 것이 실측됐다. 서버는 사람이 단 라벨인지 에이전트가 단 라벨인지 구별하지 못한다.

에이전트가 **별도 계정(`chillingdaisy-worker1`, write 협업자)**으로 PR을 열면, 사용자는 PR 작성자가 아니므로 GitHub의 Approve를 그대로 쓸 수 있다.
"Approve 필수", "새 커밋 시 승인 해제", "마지막 push도 승인 필요"를 서버가 검증한다.

**목표의 범위(정직하게):** 사용자 컴퓨터에는 `mzlikesb` 토큰도 있다. 에이전트가 설정을 일부러 바꾸면(`GH_CONFIG_DIR` 해제 등) 사용자 권한을 쓸 수 있으므로 완전한 격리는 아니다.
목표는 **정상 경로는 서버가 검증하고, 계정을 바꾸려는 시도는 훅이 막는 것**이다. 완전 격리(별도 OS 사용자·토큰 제거)는 하지 않는다.

이 PR은 작업 중 드러난 훅 오탐 두 가지도 같이 고친다. 신원 전환을 훅으로 막으려면 훅이 명령을 정확히 읽어야 하기 때문이다.
- 환경변수를 앞에 붙인 명령(`VAR=x gh pr create`)을 못 알아봐 neon 자동 실행이 빠졌다
- "neon review"라는 글자가 들어간 코멘트를 **읽기만** 해도 게시로 보고 막았다

## 신원
| 계정 | 쓰는 쪽 | 하는 일 |
|---|---|---|
| `mzlikesb` | 사용자 | 리뷰, **Approve**, large 머지, 설정 변경 |
| `chillingdaisy-worker1` | Claude Code 에이전트 세션 | 브랜치 push, PR 생성·수정, 라벨, 코멘트, neon 리뷰 게시, `@codex review` 요청, small PR의 auto-merge 예약 |
| `chatgpt-codex-connector[bot]` | Codex 웹 | 코드 리뷰(워커 계정을 Codex에 연결해 요청을 받는다) |
| `github-actions[bot]` | CI | 체크, Preview, 배포 |

에이전트 세션은 전용 gh 설정 폴더(`~/.config/gh-agent`, `chillingdaisy-worker1`만 로그인)를 쓴다. 사용자 터미널은 그대로 `mzlikesb`다.
- `.claude/settings.local.json`(개인 설정, 커밋 안 함)의 `env`:
  - `GH_CONFIG_DIR=/Users/<사용자>/.config/gh-agent` — **절대 경로**로 쓴다. `env` 값은 셸을 거치지 않아 `~`가 확장되지 않고, gh도 `~`를 풀지 않아 엉뚱한 상대 경로를 읽는다
  - `GIT_CONFIG_*`로 `credential.https://github.com.helper`를 **먼저 빈 값으로 초기화**한 뒤 `!gh auth git-credential`을 지정한다(키체인 등 기존 helper가 먼저 잡히지 않게)
  - remote는 HTTPS(`https://github.com/mzlikesb/outpost.git`). SSH remote면 이 설정이 적용되지 않으므로 `agent-env.sh`가 실패로 보고한다
- 토큰을 명령에 주입하지 않는다
- 이 설정은 **Claude Code 세션 전용**이다. 사용자가 자기 터미널에서 neon을 다시 돌리려면 `GH_CONFIG_DIR=/Users/<사용자>/.config/gh-agent scripts/neon-review.sh <PR> <플랜>`처럼 계정을 명시한다. 그 셸의 gh 계정이 `chillingdaisy-worker1`이 아니면 스크립트가 실패한다
- 사용자 터미널의 remote도 HTTPS다(PR #1 이후). 사용자 push는 기존 자격 증명(`mzlikesb`) 그대로 동작한다
- 커밋 작성자(author)는 사용자 이름 그대로 두고 `Co-Authored-By`로 에이전트를 표시한다. 누가 push·PR을 했는지는 계정으로 남는다

## 승인과 머지 (바뀐 규칙)
- 브랜치 보호(main): 필수 체크 `ci` `pr-check`, **Approve 1개 필수**, **새 커밋 시 기존 Approve 해제**, **마지막 push도 승인 필요**, `enforce_admins` 유지, squash만
- 승인 = 사용자의 GitHub Approve. 에이전트 계정은 작성자라 자기 PR을 Approve할 수 없다(서버가 막음)
- small: 에이전트가 PR을 ready로 열면서 `gh pr merge --auto --squash`로 예약한다 → 사용자가 Approve하면 체크 통과 후 자동 머지. 실제 계정이 머지하므로 production 배포가 정상으로 깨어난다
- large: 사용자가 Approve 후 직접 머지
- small을 large로 바꾸면 에이전트가 예약을 해제한다. `pr-check`가 `size:large` + 예약 켜짐을 실패로 보고, 트리거에 `auto_merge_enabled`·`auto_merge_disabled`를 넣어 예약 상태가 바뀔 때마다 다시 돈다
- **사용자는 에이전트 PR 브랜치에 직접 push하지 않는다**(웹의 "Update branch"·"Apply suggestion" 포함). "마지막 push도 승인 필요" 때문에 마지막 push가 `mzlikesb`면 아무도 Approve할 수 없게 된다. 실수로 그랬다면 에이전트가 브랜치를 다시 push(빈 커밋 등)해 마지막 pusher를 에이전트 계정으로 되돌린다
- small을 large로 바꿀 때는 **auto-merge 예약을 먼저 해제한 뒤** 라벨을 바꾼다(라벨 변경 직후 새 `pr-check`가 등록되기 전에 Approve가 들어오면 예약이 그대로 발동할 수 있다)
- **모든 PR은 에이전트 계정으로 연다.** 사용자가 직접 연 PR은 본인 Approve가 안 되므로, 긴급할 때만 사용자가 **`enforce_admins`만** 잠시 끄고 관리자 권한으로 머지한 뒤 다시 켠다. 브랜치 보호 전체를 끄지 않는다(다시 켤 때 옵션을 빠뜨리지 않게). 절차를 `AGENTS.md`에 둔다

## 걷어낼 것
- `pr-check.yml`의 `user-approval`·`auto-merge` 잡, 브랜치 보호의 `user-approval` 필수 체크
- 훅의 `user-approved` 부착 차단(서버가 막으므로 불필요)
- 에이전트 코멘트 표식 `<!-- agent -->`: 작성 계정으로 구분된다. `watch-pr.sh`는 `chillingdaisy-worker1`의 글 중 본문이 `## neon review`로 **시작하면**(접두사 일치. 이 머리줄은 모델 출력이 아니라 `neon-review.sh`가 고정으로 붙인다) `neon`, 그 외는 `agent`(자기 글이라 알림 생략)로 분류
- **`user-approved` 라벨과 `AUTOMERGE_TOKEN` 시크릿은 남겨 둔다.** 머지 후 첫 small PR에서 새 흐름이 검증된 뒤에 지운다(문제가 생기면 옛 규칙으로 바로 돌아갈 수 있게)

## 만들 것
1. `pr-check.yml`: `pr-check` 잡만 남김. 트리거에 `auto_merge_enabled`·`auto_merge_disabled` 추가, `size:large`인데 auto-merge가 켜져 있으면 실패
2. `AGENTS.md`·`CLAUDE.md`: 신원 표, 승인·머지 규칙 교체, 긴급 머지 절차, 라벨 승인 관련 문장 삭제, 신뢰 목록 설명 갱신, `settings.local.json` 예시
3. `scripts/watch-pr.sh`: 위 분류(`user`·`neon`·`agent`·`codex`·`ci`·`untrusted`), 표식 처리 삭제
4. `scripts/neon-review.sh`: 토큰 주입 대신 현재 gh 계정으로 게시. `chillingdaisy-worker1`이 아니면 실패. 게시 전에 본문의 `@` 멘션을 무력화한다(neon 2턴 리뷰 본문 속 `@codex review`가 Codex를 실제로 불러냈다)
5. 훅
   - `lib.sh`: 구간 앞의 환경변수 대입(`VAR=x cmd`)을 벗기고 해석 → `GH_CONFIG_DIR=… gh pr create`, `VAR=x git push`도 인식
   - `guard-bash.sh`: `user-approved` 규칙 삭제. neon 규칙은 **게시**(`gh pr comment`·`gh pr review`·`gh api` POST)만 막고 읽기는 허용. 계정 전환 시도 차단: `GH_CONFIG_DIR`·`GIT_CONFIG_*` 해제·덮어쓰기, `gh auth switch`·`gh auth login`·`gh auth token`, `GH_TOKEN`·`GITHUB_TOKEN` 직접 지정. 단 사용자가 직접 실행하는 명령은 훅을 타지 않는다
   - **fail-closed:** 에이전트 세션에서 쓰기 명령(`git push`, `gh pr create|edit|comment|review|merge|ready`, 쓰기 `gh api`)을 실행할 때 `GH_CONFIG_DIR`가 에이전트 폴더를 가리키지 않으면 막는다. 개인 설정 파일이 빠진 새 worktree·새 클론에서 `mzlikesb`로 조용히 넘어가지 않게 한다
   - `gh api` 쓰기 판정: `-X POST|PATCH|PUT|DELETE`뿐 아니라 `-f`·`-F`·`--field`·`--raw-field`·`--input`이 붙으면 POST로 본다
   - `git -c credential.*`도 계정 전환 시도로 막는다(`GIT_CONFIG_*`보다 우선하므로)
   - 머지: 에이전트의 `gh pr merge`는 `--auto`(small만, 훅이 PR 라벨을 조회해 확인)와 `--disable-auto`만 허용. large는 사용자가 직접 머지
   - 테스트 갱신
6. `scripts/agent-env.sh`: 에이전트 세션 점검 — gh 계정, remote가 HTTPS인지, `git credential fill`이 돌려주는 사용자 이름이 `chillingdaisy-worker1`인지. **SessionStart 훅으로 세션마다 자동 실행**해서 실패하면 경고를 띄운다(쓰기 차단은 위 fail-closed 훅이 한다)
7. 브랜치 보호 변경: **머지 직전**에 새 규칙으로 바꾸고 사용자가 이 PR을 Approve해 머지한다(이 PR은 에이전트 계정이 열었으므로 Approve 가능)
8. 워커 계정의 Codex 연결 — 완료(사용자). 워커가 단 `@codex review`에 Codex가 응답하는 것을 이 PR 2턴에서 확인

## 하지 않는 것
- `issue-sync`(머지된 PR을 관련 이슈에 기록하는 워크플로): 신원 분리와 별개라 따로 small PR로 한다
- 하네스 자동화(플레이테스트·스킬·상태줄). 첫 기능 PR 뒤로 미룬 그대로이며 번호는 004로 옮긴다(003이 첫 기능 PR)
- 커밋 author를 에이전트 계정으로 바꾸는 일, 완전한 자격 증명 격리

## 전환 순서
1. 이 PR에서 구현·리뷰를 마친다(옛 `user-approval` 잡은 삭제된 상태)
2. 머지 직전, `mzlikesb`가 열어 둔 진행 중 PR이 없는지 확인한다(있으면 새 규칙에서 Approve할 수 없다). **브랜치 보호 변경은 사용자 계정으로 한다**(워커는 write라 바꿀 수 없다). 체크리스트:
   - [ ] 필수 체크: `ci`, `pr-check` (`user-approval` 제거)
   - [ ] Approve 1개 필수
   - [ ] 새 커밋 시 기존 Approve 해제(dismiss stale reviews)
   - [ ] 마지막 push도 승인 필요(require last push approval)
   - [ ] `enforce_admins` 켬 유지, force push·삭제 금지 유지
3. 사용자가 이 PR을 Approve → 직접 머지
4. 메인 체크아웃을 main에 맞춘다(`git switch main && git pull --ff-only`). 훅은 메인 체크아웃 버전이 돌므로, 이걸 안 하면 옛 훅이 계속 돈다. 에이전트 세션을 새로 연다(`settings.local.json`의 `env` 적용)
5. 첫 small PR로 새 흐름 검증 → `user-approved` 라벨·`AUTOMERGE_TOKEN` 삭제

**롤백(새 흐름에 문제가 있을 때):** 브랜치 보호를 옛 규칙(`user-approval` 필수, Approve 필수 끔)으로 되돌린 뒤 **이 PR 전체를 revert**한다(`pr-check.yml`만 되돌리면 훅의 `user-approved` 부착 차단이 빠진 채 남는다). 라벨과 시크릿이 남아 있어 바로 옛 흐름으로 돌아간다

## Verification
### 이 PR 안에서
- `npm run test:hooks`, 기존 체크 전부 통과
- `scripts/agent-env.sh`가 에이전트 세션에서 gh·git push 모두 `chillingdaisy-worker1`, remote HTTPS를 보고한다
- 이 PR 자체가 `chillingdaisy-worker1`이 연 첫 PR이다(작성자 확인)
- `pr-check`: `size:large` + auto-merge 예약 → 실패, 예약 해제 → 다시 돌아 통과
- 훅: 에이전트 폴더가 아닌 `GH_CONFIG_DIR`(또는 미설정)로 `git push`·`gh pr create` → 차단(fail-closed). 에이전트 계정의 `gh pr merge`(옵션 없음)·large PR의 `--auto` → 차단
- 훅: 환경변수 접두사가 붙은 명령(`FOO=bar gh pr create`)도 인식해 neon 자동 실행. `GH_CONFIG_DIR=… gh …`·`unset GH_CONFIG_DIR`·`GIT_CONFIG_COUNT=… git push`·`gh auth switch` 차단. neon 코멘트 읽기는 통과
- 워커 계정이 `@codex review`를 달면 Codex가 응답한다(2턴에서 확인됨)
- `pr-check`의 `size:large` + 예약 검증은 Approve 전에 한다

### 머지 후 (첫 small PR에서)
- 에이전트 계정이 연 small PR에 사용자가 Approve → 자동 머지 → production 배포
- Approve 뒤 새 커밋 push → 승인 해제, 머지 막힘
- 에이전트 계정으로 `gh pr review --approve` 시도 → 서버가 거절
- 이 PR 머지로 이슈 #2가 닫힌다
