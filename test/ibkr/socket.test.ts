import { describe, it, expect, vi, beforeEach } from "vitest";

type Listener = (...args: unknown[]) => void;

const listeners = new Map<string, Listener[]>();
const calls: { method: string; args: unknown[] }[] = [];

function emit(event: string, ...args: unknown[]): void {
  for (const l of listeners.get(event) ?? []) l(...args);
}

function resetMockState(): void {
  listeners.clear();
  calls.length = 0;
}

vi.mock("@stoqey/ib", () => {
  class IBApi {
    constructor(_opts: unknown) {
      calls.push({ method: "constructor", args: [_opts] });
    }
    on(event: string, listener: Listener): this {
      const arr = listeners.get(event) ?? [];
      arr.push(listener);
      listeners.set(event, arr);
      return this;
    }
    once(event: string, listener: Listener): this {
      const wrap: Listener = (...args) => {
        this.off(event, wrap);
        listener(...args);
      };
      return this.on(event, wrap);
    }
    off(event: string, listener: Listener): this {
      const arr = (listeners.get(event) ?? []).filter((l) => l !== listener);
      listeners.set(event, arr);
      return this;
    }
    connect(): this {
      calls.push({ method: "connect", args: [] });
      // simulate async connection
      setTimeout(() => emit("connected"), 0);
      return this;
    }
    disconnect(): this {
      calls.push({ method: "disconnect", args: [] });
      setTimeout(() => emit("disconnected"), 0);
      return this;
    }
    get isConnected(): boolean {
      return true;
    }
  }
  const EventName = {
    connected: "connected",
    disconnected: "disconnected",
    error: "error",
  };
  return { IBApi, EventName };
});

import { createSocketClient } from "../../src/ibkr/socket.js";
import type { Config } from "../../src/config.js";

const baseConfig: Config = {
  IBKR_MODE: "socket",
  IBKR_HOST: "127.0.0.1",
  IBKR_PORT: 4002,
  IBKR_CLIENT_ID: 1,
  IBKR_PAPER_TRADING: true,
  IBKR_ALLOW_ORDERS: false,
  IBKR_LOG_LEVEL: "info",
};

describe("createSocketClient", () => {
  beforeEach(() => {
    resetMockState();
  });

  it("constructs a broker client without throwing", async () => {
    const c = await createSocketClient(baseConfig);
    expect(c).toBeDefined();
    expect(typeof c.connect).toBe("function");
    expect(typeof c.disconnect).toBe("function");
  });

  it("passes host/port/clientId to IBApi constructor", async () => {
    await createSocketClient(baseConfig);
    const ctor = calls.find((c) => c.method === "constructor");
    expect(ctor).toBeDefined();
    expect(ctor?.args[0]).toMatchObject({
      host: "127.0.0.1",
      port: 4002,
      clientId: 1,
    });
  });

  it("calls IBApi.connect when client.connect() is invoked", async () => {
    const c = await createSocketClient(baseConfig);
    await c.connect();
    expect(calls.some((x) => x.method === "connect")).toBe(true);
  });
});
