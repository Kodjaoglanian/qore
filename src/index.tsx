import React from "react";
import { render } from "ink";
import { App } from "./ui/App.js";

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

render(React.createElement(App));
