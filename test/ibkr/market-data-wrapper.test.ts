import { describe, it, expect, vi, beforeEach } from "vitest";

type Listener = (...args: unknown[]) => void;

const listeners = new Map<string, Listener[]>();
const calls: { method: string; args: unknown[] }[] = [];

function emit(event: string, ...args: unknown[]): void {
  for (const l of [...(listeners.get(event) ?? [])]) l(...args);
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
      setTimeout(() => emit("connected"), 0);
      return this;
    }
    disconnect(): this {
      return this;
    }
    reqMktData(
      reqId: number,
      contract: unknown,
      genericTickList: string,
      snapshot: boolean,
      regulatorySnapshot: boolean,
    ): this {
      calls.push({
        method: "reqMktData",
        args: [reqId, contract, genericTickList, snapshot, regulatorySnapshot],
      });
      return this;
    }
    cancelMktData(reqId: number): this {
      calls.push({ method: "cancelMktData", args: [reqId] });
      return this;
    }
    reqCurrentTime(): this {
      calls.push({ method: "reqCurrentTime", args: [] });
      setTimeout(() => emit("currentTime", Math.floor(Date.now() / 1000)), 0);
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
    tickPrice: "tickPrice",
    tickSize: "tickSize",
    tickOptionComputation: "tickOptionComputation",
    currentTime: "currentTime",
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

function lastReqMktDataCall(): { method: string; args: unknown[] } | undefined {
  return [...calls].reverse().find((c) => c.method === "reqMktData");
}

describe("socket-wrapper reqMktData — option Greeks fix (v0.1.7)", () => {
  beforeEach(() => resetMockState());

  it("passes the standard option generic-tick set for OPT contracts when caller omits it", async () => {
    const client = await createSocketClient(baseConfig);
    await client.connect();

    const promise = client.reqMktData({
      symbol: "SPY",
      secType: "OPT",
      right: "C",
      strike: 600,
      expiry: "20260612",
    });

    // Allow the microtask queue to flush so reqMktData has been called.
    await new Promise((r) => setTimeout(r, 5));

    const call = lastReqMktDataCall();
    expect(call).toBeDefined();
    // args = [reqId, contract, genericTickList, snapshot, regulatorySnapshot]
    const ticks = call!.args[2] as string;
    expect(ticks).toContain("106"); // option implied volatility
    expect(ticks).toContain("100"); // option volume
    expect(call!.args[3]).toBe(false); // snapshot=false (streaming)
    expect(call!.args[4]).toBe(false); // regulatorySnapshot=false (no paid feed needed)

    // emit a full tick sequence to let the promise resolve
    const reqId = call!.args[0] as number;
    emit("tickPrice", reqId, 1, 5.0);
    emit("tickPrice", reqId, 2, 5.2);
    emit(
      "tickOptionComputation",
      reqId,
      13,
      0.32,
      0.45,
      5.1,
      0,
      0.02,
      0.12,
      -0.05,
      600.5,
    );
    const result = (await promise) as Record<string, number>;
    expect(result.bid).toBe(5.0);
    expect(result.ask).toBe(5.2);
    expect(result.delta).toBe(0.45);
    expect(result.iv).toBe(0.32);
    expect(result.gamma).toBe(0.02);
    expect(result.theta).toBe(-0.05);
    expect(result.vega).toBe(0.12);
    expect(result.undPrice).toBe(600.5);
  });

  it("passes empty generic-tick list for STK contracts when caller omits it", async () => {
    const client = await createSocketClient(baseConfig);
    await client.connect();
    const promise = client.reqMktData({ symbol: "SPY", secType: "STK" });
    await new Promise((r) => setTimeout(r, 5));
    const call = lastReqMktDataCall()!;
    expect(call.args[2]).toBe("");
    const reqId = call.args[0] as number;
    emit("tickPrice", reqId, 1, 580.1);
    emit("tickPrice", reqId, 2, 580.2);
    const r = (await promise) as Record<string, number>;
    expect(r.bid).toBe(580.1);
    expect(r.ask).toBe(580.2);
  });

  it("respects caller-supplied genericTicks string (overrides the default)", async () => {
    const client = await createSocketClient(baseConfig);
    await client.connect();
    const promise = client.reqMktData({ symbol: "SPY", secType: "OPT" }, "100,101");
    await new Promise((r) => setTimeout(r, 5));
    const call = lastReqMktDataCall()!;
    expect(call.args[2]).toBe("100,101");
    const reqId = call.args[0] as number;
    emit("tickPrice", reqId, 1, 1);
    emit("tickPrice", reqId, 2, 1);
    emit("tickOptionComputation", reqId, 13, 0.2, 0.3, 1, 0, 0.01, 0.05, -0.01, 100);
    await promise;
  });

  it("early-exits once bid+ask+delta are populated (does not wait full timeout)", async () => {
    const client = await createSocketClient(baseConfig);
    await client.connect();
    const t0 = Date.now();
    const promise = client.reqMktData({ symbol: "SPY", secType: "OPT" });
    await new Promise((r) => setTimeout(r, 5));
    const call = lastReqMktDataCall()!;
    const reqId = call.args[0] as number;
    emit("tickPrice", reqId, 1, 5.0);
    emit("tickPrice", reqId, 2, 5.2);
    emit("tickOptionComputation", reqId, 13, 0.3, 0.45, 5.1, 0, 0.02, 0.12, -0.05, 600);
    const r = (await promise) as Record<string, number>;
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(2000); // way under the 8s timeout
    expect(r.delta).toBe(0.45);
    // Cancel must have been issued.
    expect(calls.some((c) => c.method === "cancelMktData")).toBe(true);
  });

  it("ignores informational error codes (2104/2106/2107/2108/2158) without rejecting", async () => {
    const client = await createSocketClient(baseConfig);
    await client.connect();
    const promise = client.reqMktData({ symbol: "SPY", secType: "STK" });
    await new Promise((r) => setTimeout(r, 5));
    const call = lastReqMktDataCall()!;
    const reqId = call.args[0] as number;
    // Emit a 2104 "Market data farm is connecting" notice — must NOT abort.
    emit("error", new Error("Market data farm connection is OK"), 2104, reqId);
    emit("tickPrice", reqId, 1, 100);
    emit("tickPrice", reqId, 2, 100.05);
    const r = (await promise) as Record<string, number>;
    expect(r.bid).toBe(100);
    expect(r.ask).toBe(100.05);
  });
});

describe("createSocketClient — diagnose helpers", () => {
  beforeEach(() => resetMockState());

  it("exposes ping() returning a positive latency", async () => {
    const c = await createSocketClient(baseConfig);
    await c.connect();
    const ms = await c.ping!(2000);
    expect(typeof ms).toBe("number");
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("exposes getRecentErrors() recording emitted error frames", async () => {
    const c = await createSocketClient(baseConfig);
    await c.connect();
    // Trigger an error event via the global emitter on the mocked api.
    emit("error", new Error("Market data not subscribed"), 354, 99);
    const errs = c.getRecentErrors!(60_000);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[errs.length - 1].message).toContain("Market data not subscribed");
    expect(errs[errs.length - 1].code).toBe(354);
  });

  it("isConnected() reflects underlying socket state", async () => {
    const c = await createSocketClient(baseConfig);
    expect(c.isConnected!()).toBe(true);
  });
});
