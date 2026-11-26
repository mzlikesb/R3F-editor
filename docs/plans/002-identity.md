# 002 — 승인 신원 분리

- 브랜치: `chore/002-identity`
- 등급: **large** (사용자 머지)
- 관련 이슈: Closes #2
- 마일스톤: M0 하네스
- 상태: 플랜 리뷰 1턴

## Context
지금은 PR을 사용자 계정(`mzlikesb`)으로 열고, 에이전트도 같은 계정 권한으로 움직인다. 본인 PR은 본인이 Approve할 수 없어서 승인을 `user-approved` 라벨로 대신했다.
이 라벨은 훅이 에이전트의 부착을 막는 "약속"일 뿐이다. 이슈 #2에서 변수·GraphQL로 훅을 우회할 수 있다는 것이 실측됐다. 서버는 사람이 단 라벨인지 에이전트가 단 라벨인지 구별하지 못한다.

에이전트가 **별도 계정(`chillingdaisy-worker1`, write 협업자)**으로 PR을 열면, 사용자는 PR 작성자가 아니므로 GitHub의 Approve를 그대로 쓸 수 있다.
"Approve 필수", "새 커밋 시 승인 해제", "마지막 push도 승인 필요"는 서버 기능이라 에이전트가 우회할 수 없다. 그러면 라벨 승인 장치를 모두 걷어낼 수 있다.

## 신원
| 계정 | 쓰는 쪽 | 하는 일 |
|---|---|---|
| `mzlikesb` | 사용자 | 리뷰, **Approve**, large 머지, 설정 변경 |
| `chillingdaisy-worker1` | 모든 에이전트 | 브랜치 push, PR 생성·수정, 라벨, 코멘트, neon 리뷰 게시, small PR의 auto-merge 예약 |
| `chatgpt-codex-connector[bot]` | Codex 웹 | 코드 리뷰 |
| `github-actions[bot]` | CI | 체크, Preview, 배포 |

에이전트 세션은 전용 gh 설정 폴더(`~/.config/gh-agent`, `chillingdaisy-worker1`만 로그인)를 쓴다. 사용자 터미널은 그대로 `mzlikesb`다.
- `.claude/settings.local.json`(개인 설정, 커밋 안 함)의 `env`에 `GH_CONFIG_DIR`와, git이 HTTPS 자격 증명을 gh에서 받도록 하는 `GIT_CONFIG_*`를 넣는다 → 에이전트의 `gh`와 `git push`가 모두 `chillingdaisy-worker1`으로 나간다
- 토큰을 명령에 주입하지 않는다
- 커밋 작성자(author)는 사용자 이름 그대로 두고 `Co-Authored-By`로 에이전트를 표시한다. 누가 push·PR을 했는지는 계정으로 남는다

## 승인과 머지 (바뀐 규칙)
- 브랜치 보호(main): 필수 체크 `ci` `pr-check`, **Approve 1개 필수**, **새 커밋 시 기존 Approve 해제**, **마지막 push도 승인 필요**, `enforce_admins` 유지, squash만
- 승인 = 사용자의 GitHub Approve. 에이전트 계정은 작성자라 자기 PR을 Approve할 수 없다(서버가 막음)
- small: 에이전트가 PR을 ready로 열면서 `gh pr merge --auto --squash`로 예약한다 → 사용자가 Approve하면 체크 통과 후 자동 머지. 실제 계정이 머지하므로 production 배포가 정상으로 깨어난다
- large: 사용자가 Approve 후 직접 머지
- small을 large로 바꾸면 에이전트가 예약을 해제한다(`pr-check`가 `size:large` + 예약 켜짐을 실패로 보고)

## 걷어낼 것
- `user-approved` 라벨, `pr-check.yml`의 `user-approval`·`auto-merge` 잡, 브랜치 보호의 `user-approval` 필수 체크
- 훅의 `user-approved` 부착 차단(서버가 막으므로 불필요)
- `AUTOMERGE_TOKEN` 시크릿(삭제는 사용자)
- 에이전트 코멘트 표식 `<!-- agent -->`: 작성 계정으로 구분되므로 불필요. `watch-pr.sh`의 역할은 계정 기준으로만 판단

## 만들 것
1. `pr-check.yml`: `pr-check` 잡만 남기고, `size:large`인데 auto-merge가 켜져 있으면 실패
2. `AGENTS.md`·`CLAUDE.md`: 신원 표, 승인·머지 규칙 교체, 라벨 승인 관련 문장 삭제, 신뢰 목록 설명 갱신
3. `scripts/watch-pr.sh`: `chillingdaisy-worker1`은 `agent`(에이전트·리뷰어), `mzlikesb`만 `user`. `<!-- agent -->` 표식 처리 삭제
4. `scripts/neon-review.sh`: 토큰 주입 대신 현재 gh 계정(에이전트 세션이면 `chillingdaisy-worker1`)으로 게시. 다른 계정이면 실패
5. `scripts/hooks/guard-bash.sh`·테스트: `user-approved` 규칙 삭제, 나머지 유지
6. `scripts/agent-env.sh`: 에이전트 세션 환경을 확인하는 점검 스크립트(gh 계정이 `chillingdaisy-worker1`인지, git push 자격 증명이 같은 계정인지)
7. `.claude/settings.local.json` 예시를 `AGENTS.md`에 기록(파일 자체는 커밋하지 않음)
8. 브랜치 보호 변경, 라벨 `user-approved` 삭제(머지 직전, 사용자 확인 후)
9. `.github/workflows/issue-sync.yml`: PR이 머지되면 본문 `관련 이슈` 줄의 각 이슈(`Closes`·`Fixes`·`Refs`)에 "#PR 머지 — 해결/일부 반영, 제목, 커밋" 코멘트를 단다. `Refs`는 이슈의 Development 칸에 안 잡혀서, 지금은 머지돼도 이슈에 아무 기록이 남지 않는다

## 하지 않는 것
- 하네스 자동화(플레이테스트·스킬·상태줄). 첫 기능 PR 뒤로 미룬 그대로이며 번호는 004로 옮긴다(003이 첫 기능 PR)
- 커밋 author를 에이전트 계정으로 바꾸는 일

## 순서 주의
이 PR은 **옛 규칙(라벨 승인)으로 열고 머지**한다. 브랜치 보호는 머지 직후에 새 규칙으로 바꾼다. 머지 전에 바꾸면 이 PR이 스스로 막힌다.

## Verification
### 이 PR 안에서
- `npm run test:hooks`, 기존 체크 전부 통과
- `scripts/agent-env.sh`가 에이전트 세션에서 `chillingdaisy-worker1`을 보고한다
- 이 PR 자체가 `chillingdaisy-worker1`이 연 첫 PR이다(작성자 확인)
- `pr-check`: `size:large` + auto-merge 예약 → 실패

### 머지 후 (첫 small PR에서)
- 에이전트 계정이 연 small PR에 사용자가 Approve → 자동 머지 → production 배포
- Approve 뒤 새 커밋 push → 승인 해제, 머지 막힘
- 에이전트 계정으로 `gh pr review --approve` 시도 → 서버가 거절
- 이 PR 머지 시 이슈 #2에 issue-sync 코멘트가 달리고 이슈가 닫힌다
