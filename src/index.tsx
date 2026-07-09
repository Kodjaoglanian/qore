import React from "react";
import { render } from "ink";
import { App } from "./ui/App.js";
import { handleCliArgs } from "./cli/update.js";
process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

const cliResult = handleCliArgs(process.argv.slice(2));
if (cliResult) {
  cliResult.then(() => {}).catch(() => {});
} else {
  render(React.createElement(App));
}
