import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Config } from "./config.js";

export function createServer(_config: Config): Server {
  const server = new Server(
    { name: "ibkr-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  // Tools registered in later tasks.
  return server;
}
