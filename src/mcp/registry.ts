export interface ToolSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
    minimum?: number;
  }>;
  required?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: ToolSchema;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDef> = new Map();

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  list(): Array<{
    name: string;
    description: string;
    inputSchema: ToolSchema;
  }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    for (const reqField of tool.inputSchema.required ?? []) {
      if (!(reqField in args)) {
        throw new Error(`Missing required parameter: ${reqField}`);
      }
    }

    return tool.handler(args);
  }
}
