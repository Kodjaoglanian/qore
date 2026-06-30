#!/bin/bash
# Prebuild script: patches ink to remove react-devtools-core dependency
# This allows bun build --compile to produce a working standalone binary

set -e

INK_DEVTOOLS="node_modules/ink/build/devtools.js"

if [ -f "$INK_DEVTOOLS" ]; then
  # Replace the devtools module with a no-op
  cat > "$INK_DEVTOOLS" <<'STUB'
// Patched by prebuild.sh - devtools disabled for compiled binary
const connectToDevtools = () => {};
export default connectToDevtools;
STUB
  echo "Patched ink devtools module (no-op stub)"
else
  echo "Warning: $INK_DEVTOOLS not found, skipping patch"
fi
