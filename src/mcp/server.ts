import { ToolRegistry } from "./registry.js";
import {
  type JsonRpcRequest, type JsonRpcResponse, type JsonRpcNotification,
  parseMessage, isRequest, makeResult, makeError,
  PARSE_ERROR, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR,
} from "./protocol.js";
import { sshTools } from "./tools/ssh.js";
import { discoverTools } from "./tools/discover.js";
import { dockerTools } from "./tools/docker.js";
import { databaseTools } from "./tools/database.js";
import { systemTools } from "./tools/system.js";
import { httpTools } from "./tools/http.js";
import { listResources, readResource } from "./resources.js";
import { prompts } from "./prompts.js";
import { version } from "../../package.json";

const PROTOCOL_VERSION = "2025-03-26";

export class McpServer {
  private registry: ToolRegistry;
  private initialized = false;

  constructor() {
    this.registry = new ToolRegistry();
    for (const tool of [...sshTools, ...discoverTools, ...dockerTools, ...databaseTools, ...systemTools, ...httpTools]) {
      this.registry.register(tool);
    }
  }

  async run(): Promise<void> {
    const decoder = new TextDecoder();
    let buf = "";

    const stdin = Bun.stdin.stream();

    for await (const chunk of stdin) {
      buf += decoder.decode(chunk);

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        await this.handleLine(trimmed);
      }
    }

    if (buf.trim()) {
      await this.handleLine(buf.trim());
    }
  }

  private async handleLine(line: string): Promise<void> {
    const msg = parseMessage(line);
    if (!msg) {
      this.send(makeError(null, PARSE_ERROR, "Parse error"));
      return;
    }

    if (!isRequest(msg)) {
      return;
    }

    const req = msg as JsonRpcRequest;
    const response = await this.handleRequest(req);
    if (response) {
      this.send(response);
    }
  }

  private async handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    try {
      switch (req.method) {
        case "initialize":
          return makeResult(req.id, {
            protocolVersion: PROTOCOL_VERSION,
            serverInfo: { name: "qore", version },
            capabilities: {
              tools: { listChanged: true },
              resources: { listChanged: true },
              prompts: {},
            },
          });

        case "notifications/initialized":
          this.initialized = true;
          return null;

        case "ping":
          return makeResult(req.id, {});

        case "tools/list":
          return makeResult(req.id, { tools: this.registry.list() });

        case "tools/call": {
          const name = req.params?.name as string;
          const args = (req.params?.arguments as Record<string, unknown>) ?? {};
          if (!name) {
            return makeError(req.id, INVALID_PARAMS, "Missing tool name");
          }
          try {
            const result = await this.registry.call(name, args);
            return makeResult(req.id, {
              content: [{ type: "text", text: result }],
              isError: false,
            });
          } catch (err) {
            return makeResult(req.id, {
              content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
              isError: true,
            });
          }
        }

        case "resources/list":
          return makeResult(req.id, { resources: await listResources() });

        case "resources/read": {
          const uri = req.params?.uri as string;
          if (!uri) return makeError(req.id, INVALID_PARAMS, "Missing resource uri");
          try {
            const contents = await readResource(uri);
            return makeResult(req.id, {
              contents: [{ uri, mimeType: "application/json", text: contents }],
            });
          } catch (err) {
            return makeError(req.id, INVALID_PARAMS, err instanceof Error ? err.message : String(err));
          }
        }

        case "prompts/list":
          return makeResult(req.id, {
            prompts: prompts.map(p => ({
              name: p.name,
              description: p.description,
              arguments: p.arguments,
            })),
          });

        case "prompts/get": {
          const name = req.params?.name as string;
          const args = (req.params?.arguments as Record<string, string>) ?? {};
          const prompt = prompts.find(p => p.name === name);
          if (!prompt) return makeError(req.id, INVALID_PARAMS, `Prompt not found: ${name}`);
          return makeResult(req.id, {
            messages: prompt.getMessages(args),
          });
        }

        default:
          return makeError(req.id, METHOD_NOT_FOUND, `Method not found: ${req.method}`);
      }
    } catch (err) {
      return makeError(req.id, INTERNAL_ERROR, "Internal error", err instanceof Error ? err.message : undefined);
    }
  }

  private send(resp: JsonRpcResponse | JsonRpcNotification): void {
    process.stdout.write(JSON.stringify(resp) + "\n");
  }
}
