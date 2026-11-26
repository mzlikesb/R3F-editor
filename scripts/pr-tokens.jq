# Sums token usage per PR x stage x role(model) from Claude Code session rows. Numbers only.
# Input: {rows, prs}
#   rows: [{branch, ts, id, model, role, u}]  (u = message.usage; role = agentType or "main session")
#   prs:  [{number, title, branch, intervals: [{stage, start, end}]}]  (pr-stages.jq, epoch seconds)
# The same response is logged on many lines: keep one row per message id (the last one).
def epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
def short: sub("^claude-"; "");
def stage_of($iv; $t):
  if ($iv | length) == 0 then "—"
  elif $t < ($iv | map(.start) | min) then ($iv | sort_by(.start) | first | .stage)
  else (([$iv[] | select($t >= .start and $t < .end)] | first | .stage)
        // (if $t >= ($iv | map(.end) | max) then "머지 후" else "—" end))
  end;

(.rows | reduce .[] as $r ({}; .[$r.id] = $r) | [.[]]) as $rows
| .prs
| map(. as $pr
    | [$rows[] | select(.branch == $pr.branch and .model != "<synthetic>")]
    | map(. + {stage: stage_of($pr.intervals; (.ts | epoch))})
    | group_by([.stage, .role, .model])
    | map({
        pr: $pr.number,
        title: $pr.title,
        stage: .[0].stage,
        role: "\(.[0].role) (\(.[0].model | short))",
        input: (map(.u.input_tokens // 0) | add),
        output: (map(.u.output_tokens // 0) | add),
        cache_read: (map(.u.cache_read_input_tokens // 0) | add),
        cache_write: (map(.u.cache_creation_input_tokens // 0) | add)
      })
  )
| add // []
