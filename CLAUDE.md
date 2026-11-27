@AGENTS.md

# Claude Code 전용

## 역할별 서브에이전트

역할별 에이전트 정의(모델·도구)는 `.claude/agents/*.md`에 있다. 역할 설명은 `AGENTS.md`의 역할 표를 본다.

- 개발 서브에이전트를 병렬로 돌릴 때는 `isolation: worktree`로 실행한다. 개발 리드가 각 worktree 결과를 PR 브랜치로 모은다
- 순차 작업은 PR worktree 하나를 재사용한다

## neon 호출 (Gemini 모델, Antigravity CLI `agy`)

neon은 리뷰만 한다. **훅이 자동으로 부른다**(`scripts/hooks/neon-trigger.sh`, PostToolUse): `gh pr create`나 `git push` 직후, 그 브랜치 PR이 `stage:plan-review`이고 마지막 neon 리뷰 이후 플랜 파일(`docs/plans/NNN-*.md`, tasks·qa 제외)이 바뀌었으면 백그라운드로 실행하고 끝나면 herdr 알림을 띄운다. 에이전트가 따로 부를 필요는 없다.

1. 실제 실행은 `scripts/neon-review.sh <PR 번호> docs/plans/NNN-*.md`가 한다(수동으로 다시 돌릴 때도 이것만 쓴다). 스크립트가 `agy -p`(읽기 전용, 도구 없이 플랜을 프롬프트로 받음)를 돌리고, 결과를 에이전트 세션의 gh 계정(`chillingdaisy-worker1`)으로 PR에 `neon review` 코멘트로 게시한다. 본문의 `@` 멘션은 무력화한다
2. 스크립트를 거치지 않고 `neon review` 코멘트를 직접 달면 훅이 막는다
3. 실패하면 스크립트가 `skipped(사유)` 코멘트를 남긴다. PR 본문 `리뷰 기록` 표에 대상 SHA와 판정(또는 skipped)을 적고 다음 단계로 진행한다

## 역할별 스킬

- 기획: HUD·패널 UI를 다룰 때 `minimal-ui`
- 기획: `stage:playtest`에서 `playtest`
- 기획: PR 머지 후 `retro`
- 기획: 작업 착수 시 `start-task`
- QA: `/code-review medium`
- 마일스톤이 끝날 때마다 `doc-lint`로 문서 주장을 실상태와 대조한다

## PR 감시와 리뷰 반영

GitHub 코멘트는 로컬 훅이 감지할 수 없다. 그래서 PR을 열거나 ready로 바꾸면 기획 에이전트가 Monitor 도구로 `scripts/watch-pr.sh <PR 번호>`를 띄워 둔다(1분 간격, PR이 머지·종료되면 스스로 끝난다). 새 코멘트·리뷰가 한 줄씩 알림으로 온다.

- **AI 리뷰(`[codex]`, `[neon]`)는 바로 반영**한다. 반영 후 push하고, PR 본문 리뷰 기록 표를 갱신하고, 코드가 바뀌었으면 새 SHA로 `@codex review`를 다시 요청한다
- **사용자 코멘트(`[user]`)는 정리만** 한다(막는 문제·제안·질문). 반영은 사용자가 "리뷰 끝났어"라고 한 뒤에 한다
- 에이전트 글은 작성 계정(`chillingdaisy-worker1`)으로 구분된다. neon 리뷰는 본문 머리줄 `## neon review`로 구분한다
