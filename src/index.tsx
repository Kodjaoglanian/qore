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
  render(React.createElement(App), { stdin });
}
