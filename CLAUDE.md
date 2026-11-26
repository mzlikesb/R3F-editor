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

1. `scripts/neon-review.sh <PR 번호> docs/plans/NNN-*.md`로만 실행한다. 스크립트가 `agy -p`(읽기 전용, 도구 없이 플랜을 프롬프트로 받음)를 돌리고, 결과를 **`chillingdaisy-worker1` 계정**으로 PR에 `neon review` 코멘트로 단다. 토큰은 그 호출에만 주입하고 출력하지 않는다
2. 스크립트를 거치지 않고 `neon review` 코멘트를 직접 달면 훅이 막는다
3. 실패하면 스크립트가 `skipped(사유)` 코멘트를 남긴다. PR 본문 `리뷰 기록` 표에 대상 SHA와 판정(또는 skipped)을 적고 다음 단계로 진행한다

## 역할별 스킬

- 기획: HUD·패널 UI를 다룰 때 `minimal-ui`
- QA: `/code-review medium`
- 마일스톤이 끝날 때마다 `doc-lint`로 문서 주장을 실상태와 대조한다
