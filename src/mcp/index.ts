import { McpServer } from "./server.js";

export async function runMcpServer(): Promise<void> {
  const server = new McpServer();
  await server.run();
}
