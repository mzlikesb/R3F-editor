# Sums token usage per PR x stage x role(model) from Claude Code session rows. Numbers only.
# Input: {rows, prs}
#   rows: [{branch, ts, id, model, role, u}]  (u = message.usage; role = agentType or "main session")
#   prs:  [{number, title, branch, opened, closed, intervals: [{stage, start, end}]}]  (epoch seconds;
#         intervals from pr-stages.jq)
#   now:  epoch seconds
# The same response is logged on many lines: keep one row per message id (the last one).
def epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
def short: sub("^claude-"; "");
def stage_of($iv; $t):
  if ($iv | length) == 0 then "—"
  elif $t < ($iv | map(.start) | min) then ($iv | sort_by(.start) | first | .stage)
  else (([$iv[] | select($t >= .start and $t < .end)] | first | .stage)
        // (if $t >= ($iv | map(.end) | max) then "머지 후" else "—" end))
  end;

# Link: a row whose gitBranch is a PR head branch belongs to that PR ("브랜치"). Other rows
# (main, HEAD: sessions that cd into worktrees) go by time: inside exactly one PR's
# [opened, closed] -> that PR ("시간"); inside several -> one shared bucket, counted once.
# Rows matching no PR are dropped. `closed` null means still open (until `now`).
.now as $now
| .prs as $prs
| (.rows | reduce .[] as $r ({}; .[$r.id] = $r) | [.[]]) as $rows
| [$rows[] | select(.model != "<synthetic>") | . as $r | ($r.ts | epoch) as $t
    | ([$prs[] | select(.branch == $r.branch)]) as $by
    | (if ($by | length) > 0 then {prs: [$by[0]], link: "브랜치"}
       else {prs: [$prs[] | select($t >= .opened and $t <= (.closed // $now))], link: "시간"} end) as $m
    | select(($m.prs | length) > 0)
    | if ($m.prs | length) == 1 then
        $r + {num: $m.prs[0].number, label: "#\($m.prs[0].number)", title: $m.prs[0].title, link: $m.link,
              stage: stage_of($m.prs[0].intervals; $t)}
      else
        $r + {num: 1000000, label: "동시 진행(\($m.prs | map("#\(.number)") | join(" ")))", title: "", link: "시간", stage: "—"}
      end
  ]
| group_by([.num, .label, .link, .stage, .role, .model])
| map({
    pr: .[0].label,
    title: .[0].title,
    link: .[0].link,
    stage: .[0].stage,
    role: "\(.[0].role) (\(.[0].model | short))",
    input: (map(.u.input_tokens // 0) | add),
    output: (map(.u.output_tokens // 0) | add),
    cache_read: (map(.u.cache_read_input_tokens // 0) | add),
    cache_write: (map(.u.cache_creation_input_tokens // 0) | add)
  })
