#!/usr/bin/env node

// Qore CLI entry point for npx/global install
// Requires Bun runtime -- the app uses bun:sqlite and Bun.connect

const { spawn } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

// Find the main entry point relative to this bin
const entry = path.join(__dirname, "..", "src", "index.tsx");

// Check if bun is available
function hasBun() {
  try {
    require("child_process").execSync("bun --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(entry)) {
  console.error("Qore: entry point not found. The package may be corrupted.");
  process.exit(1);
}

if (hasBun()) {
  // Run with Bun directly
  const child = spawn("bun", ["run", entry], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code || 0));
} else {
  // Bun not found -- print installation instructions
  console.log("");
  console.log("  Qore requires the Bun runtime.");
  console.log("");
  console.log("  Install Bun with one of these commands:");
  console.log("");
  console.log("    curl -fsSL https://bun.sh/install | bash");
  console.log("    npm install -g bun");
  console.log("");
  console.log("  Then run Qore again:");
  console.log("");
  console.log("    npx qore");
  console.log("");
  process.exit(1);
}
