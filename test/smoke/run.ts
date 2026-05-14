import { spawn } from "node:child_process";

const proc = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, IBKR_MODE: "socket" },
});

let buffer = "";
const pending: Array<{
  id: number;
  resolve: (val: unknown) => void;
  reject: (err: Error) => void;
}> = [];

proc.stdout.on("data", (chunk: Buffer) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line) as { id?: number };
      if (typeof msg.id === "number") {
        const i = pending.findIndex((p) => p.id === msg.id);
        if (i !== -1) {
          const [p] = pending.splice(i, 1);
          p.resolve(msg);
        }
      }
    } catch {
      // ignore non-JSON lines (e.g. server logs)
    }
  }
});

proc.on("exit", (code) => {
  if (pending.length) {
    pending.forEach((p) => p.reject(new Error(`server exited with code ${code}`)));
  }
});

function send(req: { jsonrpc: "2.0"; id: number; method: string; params?: unknown }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    pending.push({ id: req.id, resolve, reject });
    proc.stdin.write(JSON.stringify(req) + "\n");
    setTimeout(() => {
      const i = pending.findIndex((p) => p.id === req.id);
      if (i !== -1) {
        pending.splice(i, 1);
        reject(new Error(`timeout waiting for response id=${req.id}`));
      }
    }, 10_000);
  });
}

try {
  const init = await send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0" },
    },
  });
  console.log("INIT:", JSON.stringify(init, null, 2));

  // Some MCP servers require an initialized notification before tools/list works.
  proc.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }) + "\n",
  );

  const list = (await send({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  })) as { result?: { tools?: unknown[] } };
  const toolCount = list.result?.tools?.length ?? 0;
  console.log(`LIST: ${toolCount} tools`);

  const call = await send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "bs_price",
      arguments: { S: 100, K: 100, T: 0.082, r: 0.05, sigma: 0.2, right: "C" },
    },
  });
  console.log("CALL:", JSON.stringify(call, null, 2));

  proc.kill();
  process.exit(0);
} catch (e) {
  console.error("SMOKE FAILED:", e);
  proc.kill();
  process.exit(1);
}
