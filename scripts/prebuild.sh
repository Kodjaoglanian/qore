#!/bin/bash
# Prebuild script: patches ink to remove react-devtools-core dependency
# and guards stdin.ref()/unref() for Bun compiled binaries.
# This allows bun build --compile to produce a working standalone binary

set -e

INK_DEVTOOLS="node_modules/ink/build/devtools.js"
INK_APP="node_modules/ink/build/components/App.js"

# 1. Replace the devtools module with a no-op
if [ -f "$INK_DEVTOOLS" ]; then
  cat > "$INK_DEVTOOLS" <<'STUB'
// Patched by prebuild.sh - devtools disabled for compiled binary
const connectToDevtools = () => {};
export default connectToDevtools;
STUB
  echo "Patched ink devtools module (no-op stub)"
else
  echo "Warning: $INK_DEVTOOLS not found, skipping patch"
fi

# 2. Guard stdin.ref() and stdin.unref() — Bun compiled binaries don't have these
# Use -i.bak for BSD sed (macOS) compatibility, then clean up the backup
if [ -f "$INK_APP" ]; then
  sed -i.bak 's/stdin\.ref();/if (typeof stdin.ref === "function") stdin.ref();/g' "$INK_APP"
  sed -i.bak 's/stdin\.unref();/if (typeof stdin.unref === "function") stdin.unref();/g' "$INK_APP"
  rm -f "${INK_APP}.bak"
  echo "Patched ink App.js (stdin.ref/unref guards)"
else
  echo "Warning: $INK_APP not found, skipping patch"
fi
