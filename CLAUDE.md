@AGENTS.md

# Claude Code 전용

## 역할별 서브에이전트

| 역할        | 에이전트                     | 모델   |
| ----------- | ---------------------------- | ------ |
| 기획/디자인 | `.claude/agents/planner.md`  | opus   |
| 개발 리드   | `.claude/agents/dev-lead.md` | opus   |
| 개발        | `.claude/agents/dev.md`      | sonnet |
| QA          | `.claude/agents/qa.md`       | opus   |

- 개발 서브에이전트를 병렬로 돌릴 때는 `isolation: worktree`로 실행한다. 개발 리드가 각 worktree 결과를 PR 브랜치로 모은다
- 순차 작업은 PR worktree 하나를 재사용한다

## neon(Gemini) 호출

neon은 리뷰만 한다. 기획 에이전트가 다음 시점에 호출한다: draft PR을 올릴 때, 플랜을 고칠 때마다.

1. Antigravity CLI(`agy`)를 읽기 전용 비대화식으로 실행한다. 프롬프트와 플랜을 한 문자열로 넘긴다:
   `agy -p "$(cat .claude/prompts/neon-plan-review.md; echo; cat docs/plans/NNN-*.md)" --mode plan --print-timeout 300s`
   `agy`는 시작할 때 프로젝트 규칙(`AGENTS.md`)을 스스로 읽는다
2. 출력을 PR 코멘트로 단다. 제목은 `neon review`
3. PR 본문 `리뷰 기록` 표에 대상 SHA와 판정을 기록한다
4. 한도·CLI 오류로 실패하면 표에 `skipped(사유)`로 적고 다음 단계로 진행한다

## 역할별 스킬

- 기획: HUD·패널 UI를 다룰 때 `minimal-ui`
- QA: `/code-review medium`
- 마일스톤이 끝날 때마다 `doc-lint`로 문서 주장을 실상태와 대조한다
