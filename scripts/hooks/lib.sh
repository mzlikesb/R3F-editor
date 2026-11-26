#!/usr/bin/env bash
# Shared helpers for Bash-tool hooks.

# Leading `VAR=value ` assignments (optionally after `env `) on a segment.
assign_re='^[[:space:]]*(env[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]*)[[:space:]]+)+'

# split_segments <command>: one shell segment per line (split on && || ; |), with leading
# environment assignments stripped so `FOO=1 git push` reads as `git push`.
split_segments() {
  sed -E 's/(&&|\|\||;|\|)/\n/g' <<<"$1" | sed -E "s/${assign_re}//"
}

# raw_segments <command>: segments without stripping assignments.
raw_segments() {
  sed -E 's/(&&|\|\||;|\|)/\n/g' <<<"$1"
}

# resolve_dir <base> <path>: absolute path of <path> relative to <base>, or empty if missing.
resolve_dir() {
  local base=$1 path=$2
  path=${path%\"}; path=${path#\"}; path=${path%\'}; path=${path#\'}
  case "$path" in
    "~") path=$HOME ;;
    "~/"*) path="$HOME/${path#\~/}" ;;
    /*) ;;
    *) path="$base/$path" ;;
  esac
  (cd "$path" 2>/dev/null && pwd -P) || true
}

# dir_for <cwd> <command> <segment-regex>: the directory the first segment matching
# <segment-regex> runs in, following earlier `cd X` segments and that segment's `git -C X`.
# Prints nothing when no segment matches.
dir_for() {
  local dir=$1 cmd=$2 re=$3 seg target
  while IFS= read -r seg; do
    if [[ $seg =~ ^[[:space:]]*cd[[:space:]]+([^[:space:]]+) ]]; then
      target=$(resolve_dir "$dir" "${BASH_REMATCH[1]}")
      [ -n "$target" ] && dir=$target
      continue
    fi
    if grep -qE "$re" <<<"$seg"; then
      if [[ $seg =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]]; then
        target=$(resolve_dir "$dir" "${BASH_REMATCH[1]}")
        [ -n "$target" ] && dir=$target
      fi
      echo "$dir"
      return 0
    fi
  done < <(split_segments "$cmd")
}

# agent_identity_ok: this process's gh config is the agent account's, and git pushes
# get their HTTPS credentials from that gh config. Used to fail closed.
AGENT_LOGIN=${AGENT_LOGIN:-chillingdaisy-worker1}
agent_gh_ok() {
  [ -n "${GH_CONFIG_DIR:-}" ] && [ -f "$GH_CONFIG_DIR/hosts.yml" ] &&
    grep -qE "^[[:space:]]+user:[[:space:]]+${AGENT_LOGIN}[[:space:]]*$" "$GH_CONFIG_DIR/hosts.yml"
}
agent_git_ok() {
  local n=${GIT_CONFIG_COUNT:-0} i key val helper=""
  for ((i = 0; i < n; i++)); do
    key="GIT_CONFIG_KEY_$i"; val="GIT_CONFIG_VALUE_$i"
    [ "${!key:-}" = "credential.https://github.com.helper" ] && helper=${!val:-}
  done
  [ "$helper" = "!gh auth git-credential" ]
}
