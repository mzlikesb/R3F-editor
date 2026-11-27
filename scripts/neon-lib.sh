#!/usr/bin/env bash
# Helpers for scripts/neon-art-critique.sh (sourced; also unit-tested without agy or gh).

# Zero-width joiner after `@` so model text cannot ping anyone (same idea as neon-review.sh).
neon_neutralize_mentions() { # stdin -> stdout
  local zwj=$'\xe2\x80\x8d' text
  text=$(cat)
  printf '%s' "${text//@/@$zwj}"
}

# Replace the home directory with `~` so comments do not expose the user name.
neon_shorten_home() { # stdin -> stdout
  local text tilde='~'
  text=$(cat)
  printf '%s' "${text//$HOME/$tilde}"
}

# neon_pick_screenshots <result-dir> [per-persona=3] [total=9]
# Persona folders hold page-*.png. Per persona: first, last, then middle (a short folder
# gives fewer). Ranks are interleaved across personas so the total cap cuts evenly.
neon_pick_screenshots() {
  local dir=$1 per=${2:-3} total=${3:-9} d
  [ -d "$dir" ] || return 0
  local -a personas=() files
  while IFS= read -r d; do
    [ -n "$(find "$d" -maxdepth 1 -name '*.png' -print -quit)" ] && personas+=("$d")
  done < <(find "$dir" -mindepth 1 -maxdepth 1 -type d | sort)
  local -a rank0=() rank1=() rank2=()
  local n mid
  for d in ${personas[@]+"${personas[@]}"}; do
    files=()
    while IFS= read -r f; do files+=("$f"); done < <(find "$d" -maxdepth 1 -name '*.png' | sort)
    n=${#files[@]}
    rank0+=("${files[0]}")
    [ "$n" -gt 1 ] && [ "$per" -ge 2 ] && rank1+=("${files[$((n - 1))]}")
    mid=$((n / 2))
    [ "$n" -gt 2 ] && [ "$per" -ge 3 ] && rank2+=("${files[$mid]}")
  done
  local picked=0 f
  for f in ${rank0[@]+"${rank0[@]}"} ${rank1[@]+"${rank1[@]}"} ${rank2[@]+"${rank2[@]}"}; do
    [ "$picked" -ge "$total" ] && break
    echo "$f"
    picked=$((picked + 1))
  done
}

# neon_run_sha <result-dir> [explicit-sha]: the tested SHA. run.json's "sha" wins; else the
# explicit argument; else fail (no fallback to the current checkout).
neon_run_sha() {
  local sha=""
  if [ -f "$1/run.json" ]; then
    sha=$(sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1/run.json" | head -1)
  fi
  [ -n "$sha" ] || sha=${2:-}
  [ -n "$sha" ] || return 1
  printf '%s' "$sha"
}
