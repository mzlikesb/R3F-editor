# Turns one PR's timeline into per-stage time, commits per stage, and human wait times.
# Input: {pr, timeline} — REST shapes (`GET /pulls/N`, `GET /issues/N/timeline`).
# Stages come from `stage:*` labels; the last open stage ends at the merge.
# Human wait (approve): last Codex review or commit before the final user Approve → that Approve.
# Human wait (plan): last plan commit or plan review inside plan-review → the stage change
#   (an approximation: plan approval often happens in chat, which leaves no trace).
def t: (.created_at // .submitted_at // .committer.date);
def ts: t | fromdateiso8601;
def mins($a; $b): (($b - $a) / 60) | floor;
def body: .body // "";
def who: (.actor.login // .user.login // "");
def codex_receipt: who == "chatgpt-codex-connector[bot]" and (body | contains("codex-review-receipt"));
def neon: who == "chillingdaisy-worker1" and (body | startswith("## neon review"));

. as $d
| ($d.pr.merged_at // null) as $merged
| ([$d.timeline[] | select(t != null)] | sort_by(ts)) as $ev
| ([$ev[] | select(.event == "committed") | ts]) as $commits
| ([$ev[] | select((.event == "labeled" or .event == "unlabeled") and (.label.name | startswith("stage:")))]) as $lab
# Intervals per stage: a label opens one, its removal closes it; still open → ends at merge.
| (reduce $lab[] as $e ({open: {}, done: []};
    ($e.label.name | ltrimstr("stage:")) as $s
    | if $e.event == "labeled" then .open[$s] = ($e | ts)
      elif .open[$s] != null then .done += [{stage: $s, start: .open[$s], end: ($e | ts)}] | .open |= del(.[$s])
      else . end)
  | .done + [.open | to_entries[] | select($merged != null) | {stage: .key, start: .value, end: ($merged | fromdateiso8601)}]
  ) as $iv
# Stages still open on an unmerged PR: end null (until now).
| (if $merged != null then [] else
    (reduce $lab[] as $e ({}; ($e.label.name | ltrimstr("stage:")) as $s
      | if $e.event == "labeled" then .[$s] = ($e | ts) else del(.[$s]) end)
    | to_entries | map({stage: .key, start: .value, end: null}))
  end) as $still_open
# Commits pushed before the first stage label (e.g. the plan commit right before the PR
# opens) belong to the first stage.
| ([$iv[].start] | min) as $first
| ($iv | group_by(.stage) | map({
    key: .[0].stage,
    value: {
      min: (map(mins(.start; .end)) | add),
      commits: ([.[] as $i | (if $i.start == $first then -1e18 else $i.start end) as $from
        | $commits[] | select(. >= $from and . < $i.end)] | length)
    }
  }) | from_entries) as $stages
# `intervals` (epoch seconds) are exposed for scripts/pr-tokens.jq.
# Final user Approve and what it waited on.
| ([$ev[] | select(.event == "reviewed" and who == "mzlikesb" and .state == "approved") | ts] | last) as $approve
| (if $approve == null then null else
    ([$ev[] | select((.event == "committed") or ((.event == "commented" or .event == "reviewed") and codex_receipt)) | ts | select(. <= $approve)] | max) as $anchor
    | if $anchor == null then null else mins($anchor; $approve) end
  end) as $wait_approve
# Plan approval wait inside the (first) plan-review interval.
| ([$iv[] | select(.stage == "plan-review")] | first) as $plan
| (if $plan == null then null else
    ([$ev[] | select((.event == "committed") or ((.event == "commented" or .event == "reviewed") and (codex_receipt or neon))) | ts | select(. >= $plan.start and . < $plan.end)] | max) as $last
    | if $last == null then null else mins($last; $plan.end) end
  end) as $wait_plan
| {
    number: $d.pr.number,
    title: $d.pr.title,
    stages: $stages,
    intervals: ([$iv[] | {stage, start, end}] + $still_open),
    wait_plan_min: $wait_plan,
    wait_approve_min: $wait_approve
  }
