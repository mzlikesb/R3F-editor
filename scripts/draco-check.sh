#!/usr/bin/env bash
# public/draco must hold the same Draco decoder files as the installed three (plan 005 A.2).
# After upgrading three: scripts/compress.sh --draco
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
src="$root/node_modules/three/examples/jsm/libs/draco/gltf"
fail=0
for f in draco_wasm_wrapper.js draco_decoder.wasm; do
  if cmp -s "$src/$f" "$root/public/draco/$f"; then
    echo "ok   draco/$f"
  else
    echo "FAIL draco/$f differs from three (run scripts/compress.sh --draco)"
    fail=1
  fi
done
exit $fail
