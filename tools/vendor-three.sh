#!/usr/bin/env bash
# Fetches the pinned Three.js r170 files used by the game into vendor/three/.
set -euo pipefail
VER="0.170.0"
BASE="https://cdn.jsdelivr.net/npm/three@${VER}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/vendor/three"
FILES=(
  LICENSE
  build/three.module.min.js
  examples/jsm/postprocessing/EffectComposer.js
  examples/jsm/postprocessing/RenderPass.js
  examples/jsm/postprocessing/UnrealBloomPass.js
  examples/jsm/postprocessing/OutputPass.js
  examples/jsm/postprocessing/ShaderPass.js
  examples/jsm/postprocessing/MaskPass.js
  examples/jsm/postprocessing/Pass.js
  examples/jsm/shaders/CopyShader.js
  examples/jsm/shaders/LuminosityHighPassShader.js
  examples/jsm/shaders/OutputShader.js
  examples/jsm/utils/BufferGeometryUtils.js
)
fetch() {
  local p="$1"
  [ -f "$OUT/$p" ] && return 0
  mkdir -p "$(dirname "$OUT/$p")"
  if curl -fsSL "$BASE/$p" -o "$OUT/$p"; then echo "  + $p"; else rm -f "$OUT/$p"; echo "  - $p (not in package, skipped)"; fi
}
for f in "${FILES[@]}"; do fetch "$f"; done
# Resolve relative imports until nothing new is found.
changed=1
while [ $changed -eq 1 ]; do
  changed=0
  while IFS= read -r js; do
    dir="$(dirname "${js#$OUT/}")"
    for rel in $(grep -oE "from '\.{1,2}/[^']+'" "$js" | sed -E "s/from '(.*)'/\1/"); do
      p="$(python3 -c "import os,sys;print(os.path.normpath(os.path.join(sys.argv[1],sys.argv[2])))" "$dir" "$rel")"
      if [ ! -f "$OUT/$p" ]; then fetch "$p"; changed=1; fi
    done
  done < <(find "$OUT" -name '*.js')
done
echo "Three.js $VER vendored into vendor/three/"
