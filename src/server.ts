import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { ANALYTICS_TOOL_DEFS } from "./tools/analytics.tools.js";
import { MARKET_CONTEXT_TOOL_DEFS } from "./tools/market-context.tools.js";
import type { ToolDef } from "./tools/zod-helpers.js";

export function createServer(config: Config): Server {
  const server = new Server(
    { name: "ibkr-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const tools: ToolDef[] = [
    ...ANALYTICS_TOOL_DEFS,
    ...MARKET_CONTEXT_TOOL_DEFS,
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
    const result = await tool.handler(req.params.arguments);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  void config;
  return server;
}
