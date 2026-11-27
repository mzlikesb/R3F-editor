# Decides the `codex-reviewed` commit status for one PR head.
# Input (slurped): {"head": "<sha>", "comments": [...issue comments], "reviews": [...PR reviews]}
# Output: {"state": "success"|"pending", "description": "..."}
# Passes only when Codex itself (exact bot login) left a receipt or a completed
# state summary for a commit that is the current head. Findings do not matter here.
def codex: . == "chatgpt-codex-connector[bot]";
def short: .[0:7];
. as $in
| ($in.head | ascii_downcase) as $head
| [ ($in.comments[]? | {login: .user.login, body: (.body // "")}),
    ($in.reviews[]?  | {login: .user.login, body: (.body // "")}) ]
| map(select(.login | codex)) as $mine
# Receipt: marker plus "**Reviewed commit:** `<sha>`" where sha is 7+ hex chars and a head prefix.
| ([ $mine[]
    | select(.body | contains("<!-- codex-review-receipt:v1 -->"))
    | .body | capture("\\*\\*Reviewed commit:\\*\\* `(?<sha>[0-9a-fA-F]{7,40})`")?
    | .sha | ascii_downcase | . as $s
    | select($head | startswith($s)) ] | first) as $receipt
# State summary: codex-review-state:v1 JSON with code_review.commit_sha == head and status completed.
| ([ $mine[]
    | .body | capture("codex-review-state:v1 (?<j>\\{.*?\\}\\s*\\})"; "s")?
    | .j | (try fromjson catch null)
    | select(. != null and .code_review.commit_sha != null)
    | select((.code_review.commit_sha | ascii_downcase) == $head and .code_review.status == "completed")
    | .code_review.commit_sha ] | first) as $state
| ($receipt // $state) as $hit
| if $hit != null
  then {state: "success", description: "Codex가 \($hit | short)를 리뷰함"}
  else {state: "pending", description: "head \($head | short)에 Codex 리뷰 없음 — @codex review 요청"}
  end
