#!/bin/bash
set -e

# Define paths
CLI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXA_ROOT="$(cd "$CLI_ROOT/../jetski/Exafunction" && pwd)"
TELEPORTER_TS="$CLI_ROOT/packages/core/src/teleportation/trajectory_teleporter.ts"
TELEPORTER_MIN_JS="$CLI_ROOT/packages/core/src/teleportation/trajectory_teleporter.min.js"

if [ ! -d "$EXA_ROOT" ]; then
  echo "Error: Exafunction directory not found at $EXA_ROOT"
  exit 1
fi

echo "Building Protobuf JS definitions in Exafunction..."
cd "$EXA_ROOT"
pnpm --dir exa/proto_ts build

echo "Bundling and minifying trajectory_teleporter.ts..."
# Because esbuild resolves relative imports from the source file's directory,
# and trajectory_teleporter.ts playfully imports './exa/...', we copy it to EXA_ROOT
# temporarily for the build step to succeed.
cp "$TELEPORTER_TS" "$EXA_ROOT/trajectory_teleporter_tmp.ts"

cd "$EXA_ROOT"
pnpm dlx esbuild "./trajectory_teleporter_tmp.ts" \
  --bundle \
  --format=esm \
  --platform=node \
  --outfile="$TELEPORTER_MIN_JS"

rm "$EXA_ROOT/trajectory_teleporter_tmp.ts"

echo "Done! Wrote bundle to $TELEPORTER_MIN_JS"
