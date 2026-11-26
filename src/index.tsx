import React from "react";
import { render } from "ink";
import { App } from "./ui/App.js";
import { handleCliArgs } from "./cli/update.js";
import { createWindowsStdinBridge } from "./ui/stdin-bridge.js";

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

const cliResult = handleCliArgs(process.argv.slice(2));
if (cliResult) {
  cliResult.then(() => {}).catch(() => {});
} else {
  const stdin = process.platform === "win32" ? createWindowsStdinBridge() : process.stdin;

  const restoreTerminalAndExit = () => {
    try {
      if (typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(false);
      }
      if (typeof process.stdin.pause === "function") {
        process.stdin.pause();
      }
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", restoreTerminalAndExit);
  process.on("SIGTERM", restoreTerminalAndExit);

  render(React.createElement(App), { stdin, exitOnCtrlC: false });
}
