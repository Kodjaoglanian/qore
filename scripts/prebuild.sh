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

# 2. Patch ink App.js for Bun compiled binaries:
#    a) isRawModeSupported() returns stdin.isTTY which is undefined in Bun compiled
#       binaries even when running in a real terminal — force it to return true
#    b) Guard stdin.ref()/unref() — Bun compiled binaries may not have these methods
# Use -i.bak for BSD sed (macOS) compatibility, then clean up the backup
if [ -f "$INK_APP" ]; then
  sed -i.bak 's/return this\.props\.stdin\.isTTY;/return true;/g' "$INK_APP"
  sed -i.bak 's/stdin\.ref();/if (typeof stdin.ref === "function") stdin.ref();/g' "$INK_APP"
  sed -i.bak 's/stdin\.unref();/if (typeof stdin.unref === "function") stdin.unref();/g' "$INK_APP"
  rm -f "${INK_APP}.bak"
  echo "Patched ink App.js (isRawModeSupported=true, stdin.ref/unref guards)"
else
  echo "Warning: $INK_APP not found, skipping patch"
fi

# 3. Remove ssh2 native crypto binding — force pure JS fallback
#    The .node binary can segfault on some filesystems and is not needed
#    for bun build --compile (Bun has its own crypto). ssh2 has a built-in
#    try/catch that falls back to JS if the binding is absent.
SSHCRYPTO="node_modules/ssh2/lib/protocol/crypto/build/Release/sshcrypto.node"
if [ -f "$SSHCRYPTO" ]; then
  rm -f "$SSHCRYPTO"
  echo "Removed ssh2 native crypto binding (using JS fallback)"
fi

# 4. Remove cpu-features — optional dep of ssh2, can also segfault
if [ -d "node_modules/cpu-features" ]; then
  rm -rf "node_modules/cpu-features"
  echo "Removed cpu-features module (optional, not needed for build)"
fi
