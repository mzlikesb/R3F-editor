#!/usr/bin/env bash
# Builds the committed static assets of the base scene (plan 005 A.1-A.2).
#   scripts/compress.sh           models + HDRI + Draco decoder
#   scripts/compress.sh --draco   only copy the Draco decoder from the installed three
# Originals go to assets-src/ (gitignored). Outputs: public/models, public/hdri, public/draco.
# Nothing downloaded is executed; only the listed files are unzipped (unzip -j).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$root"

# --- Sources (keep in sync with CREDITS.md) ---------------------------------
# Kenney Space Kit 2.0, CC0. Page https://kenney.nl/assets/space-kit
# The download link is signed and single use: fetch the page (cookie), then the JSON below.
KENNEY_PAGE="https://kenney.nl/assets/space-kit"
KENNEY_LINK="https://kenney.nl/download-link/6173736574732f73706163652d6b6974"
KENNEY_ZIP_DIR="Models/GLTF format"
# <original file in zip> <output name in public/models>
KENNEY_FILES=(
  "machine_generatorLarge.glb generator"
  "machine_barrelLarge.glb oxygen"
  "hangar_roundGlass.glb greenhouse"
  "satelliteDish_large.glb comms"
  "hangar_roundA.glb habitat"
  "rock_largeA.glb rock-a"
  "rock_largeB.glb rock-b"
  "rocks_smallA.glb rocks-small"
  "crater.glb crater"
)
# Poly Haven kloofendal_48d_partly_cloudy_puresky 1k, CC0 (Greg Zaal, Jarod Guest)
HDRI_URL="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr"
HDRI_SHA256="fd94c84997b8a3c353b62c2125a9b44e19509956986a126e472684432a02d798"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
# -----------------------------------------------------------------------------

copy_draco() {
  local src=node_modules/three/examples/jsm/libs/draco/gltf
  mkdir -p public/draco
  cp "$src/draco_wasm_wrapper.js" "$src/draco_decoder.wasm" public/draco/
  echo "draco decoder copied from $src"
}

if [ "${1:-}" = "--draco" ]; then
  copy_draco
  exit 0
fi

src=assets-src/space-kit
mkdir -p "$src" public/models public/hdri

# Download only if some original is missing.
missing=0
for e in "${KENNEY_FILES[@]}"; do
  [ -f "$src/${e%% *}" ] || missing=1
done
if [ "$missing" = 1 ]; then
  dl="$(mktemp -d)"
  trap 'rm -rf "$dl"' EXIT
  jar="$dl/cookies.txt"
  curl -fsSL -A "$UA" -c "$jar" -o /dev/null "$KENNEY_PAGE"
  url="$(curl -fsSL -A "$UA" -b "$jar" -H "Referer: $KENNEY_PAGE" "$KENNEY_LINK" | jq -r .url)"
  curl -fsSL -A "$UA" -o "$dl/space-kit.zip" "$url"
  args=()
  for e in "${KENNEY_FILES[@]}"; do args+=("$KENNEY_ZIP_DIR/${e%% *}"); done
  unzip -j -o "$dl/space-kit.zip" "${args[@]}" -d "$src"
fi

before=0
after=0
for e in "${KENNEY_FILES[@]}"; do
  in="${e%% *}"
  out="public/models/${e##* }.glb"
  tmp="$(mktemp -d)"
  npx gltf-transform center "$src/$in" "$tmp/a.glb" --pivot below
  npx gltf-transform palette "$tmp/a.glb" "$tmp/b.glb" --min 2
  npx gltf-transform join "$tmp/b.glb" "$tmp/c.glb"
  npx gltf-transform draco "$tmp/c.glb" "$out"
  rm -rf "$tmp"
  b=$(wc -c <"$src/$in")
  a=$(wc -c <"$out")
  before=$((before + b))
  after=$((after + a))
  echo "$in: $b -> $a bytes ($out)"
done
echo "models total: $before -> $after bytes"

# HDRI: download once, verify, halve to 512x256.
hdr="assets-src/kloofendal_1k.hdr"
if [ ! -f "$hdr" ]; then
  curl -fsSL -o "$hdr" "$HDRI_URL"
fi
echo "$HDRI_SHA256  $hdr" | shasum -a 256 -c -
node scripts/hdr-downscale.mjs "$hdr" public/hdri/sky-512.hdr

copy_draco
du -ck public/models public/hdri public/draco | tail -1
