# Turns one PR's raw GitHub data into a retro row.
# Input: {pr, comments, reviews, inline, runs} — REST shapes (logins keep their [bot] suffix).
# Only exact trusted logins count; anyone else is ignored (public repo).
def login: .user.login;
def codex: login == "chatgpt-codex-connector[bot]";
def agent: login == "chillingdaisy-worker1";
def user: login == "mzlikesb";
def body: .body // "";
def neon: agent and (body | startswith("## neon review"));
def receipt: codex and (body | contains("codex-review-receipt"));
def minutes($a; $b): (($b | fromdateiso8601) - ($a | fromdateiso8601)) / 60 | floor;

. as $d
| ([$d.comments[], $d.reviews[]] ) as $top
| {
    number: $d.pr.number,
    title: $d.pr.title,
    open_to_merge_min: (if $d.pr.merged_at then minutes($d.pr.created_at; $d.pr.merged_at) else null end),
    codex_reviews: ([$top[] | select(receipt)] | length),
    codex_findings: ([$d.inline[] | select(codex)] | length),
    neon_reviews: ([$d.comments[] | select(neon) | select(body | split("\n")[0] | contains("skipped") | not)] | length),
    neon_skipped: ([$d.comments[] | select(neon) | select(body | split("\n")[0] | contains("skipped"))] | length),
    user_comments: (([$d.comments[], $d.inline[] | select(user)] | length)
      + ([$d.reviews[] | select(user and .state != "APPROVED" and (body | length) > 0)] | length)),
    approvals: ([$d.reviews[] | select(user and .state == "APPROVED")] | length),
    ci_failures: ([$d.runs[] | select(.conclusion == "failure")] | length)
  }
