#!/usr/bin/env bash
# Shared helpers for Bash-tool hooks.

# split_segments <command>: one shell segment per line (split on && || ; |).
split_segments() {
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
