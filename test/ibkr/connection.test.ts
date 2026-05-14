import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Config } from "../../src/config.js";
import type { BrokerClient } from "../../src/ibkr/connection.js";

const baseConfig: Config = {
  IBKR_MODE: "socket",
  IBKR_HOST: "127.0.0.1",
  IBKR_PORT: 4002,
  IBKR_CLIENT_ID: 42,
  IBKR_PAPER_TRADING: true,
  IBKR_ALLOW_ORDERS: false,
  IBKR_LOG_LEVEL: "info",
};

// State controllable from each test, picked up by the mocked socket module.
const socketState = {
  createCalls: 0,
  alive: true,
  disconnectCalls: 0,
  clientIdSequence: [] as number[],
  // when true, the first attempt to create rejects with "client id already in use"
  rejectFirstAttempt: false,
  rejectionsRemaining: 0,
};

function resetSocketState(): void {
  socketState.createCalls = 0;
  socketState.alive = true;
  socketState.disconnectCalls = 0;
  socketState.clientIdSequence = [];
  socketState.rejectFirstAttempt = false;
  socketState.rejectionsRemaining = 0;
}

vi.mock("../../src/ibkr/socket.js", () => {
  return {
    createSocketClient: async (config: Config): Promise<BrokerClient> => {
      const id = config.IBKR_CLIENT_ID;
      socketState.clientIdSequence.push(id);
      if (socketState.rejectionsRemaining > 0) {
        socketState.rejectionsRemaining -= 1;
        throw new Error("client id already in use");
      }
      socketState.createCalls += 1;
      const client: BrokerClient = {
        connect: async () => {},
        disconnect: async () => {
          socketState.disconnectCalls += 1;
        },
        isAlive: async () => socketState.alive,
        reqAccountSummary: async () => ({}),
        reqPositions: async () => [],
        reqMktData: async () => ({}),
        reqSecDefOptParams: async () => ({}),
        reqHistoricalData: async () => [],
        placeOrder: async () => ({}),
        cancelOrder: async () => {},
        reqAllOpenOrders: async () => [],
      };
      return client;
    },
  };
});

import {
  getBrokerClient,
  resetBrokerClient,
  withBrokerRetry,
} from "../../src/ibkr/connection.js";

describe("getBrokerClient singleton", () => {
  beforeEach(async () => {
    resetSocketState();
    await resetBrokerClient();
  });

  it("returns the cached singleton on healthy connection", async () => {
    const a = await getBrokerClient(baseConfig);
    const b = await getBrokerClient(baseConfig);
    expect(a).toBe(b);
    expect(socketState.createCalls).toBe(1);
  });

  it("reconnects on next call when cached client is no longer alive", async () => {
    const a = await getBrokerClient(baseConfig);
    expect(socketState.createCalls).toBe(1);
    socketState.alive = false;
    const b = await getBrokerClient(baseConfig);
    expect(socketState.createCalls).toBe(2);
    expect(socketState.disconnectCalls).toBeGreaterThanOrEqual(1);
    expect(b).not.toBe(a);
    // new client should report alive by default
    socketState.alive = true;
  });
});

describe("withBrokerRetry", () => {
  beforeEach(async () => {
    resetSocketState();
    await resetBrokerClient();
  });

  it("reconnects and retries once on dead-socket timeout error", async () => {
    let calls = 0;
    const result = await withBrokerRetry(baseConfig, async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("IB request timed out after 5000ms");
      }
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(socketState.createCalls).toBe(2);
  });

  it("does NOT retry on non-socket errors", async () => {
    let calls = 0;
    await expect(
      withBrokerRetry(baseConfig, async () => {
        calls += 1;
        throw new Error("Invalid symbol: validation failed");
      }),
    ).rejects.toThrow(/validation failed/);
    expect(calls).toBe(1);
    expect(socketState.createCalls).toBe(1);
  });
});

describe("clientId rotation on handshake reject", () => {
  beforeEach(async () => {
    resetSocketState();
    await resetBrokerClient();
  });

  it("retries with clientId+1 when the configured id is rejected", async () => {
    socketState.rejectionsRemaining = 1; // first attempt fails, second succeeds
    const client = await getBrokerClient(baseConfig);
    expect(client).toBeDefined();
    expect(socketState.clientIdSequence).toEqual([42, 43]);
  });

  it("gives up after 3 attempts", async () => {
    socketState.rejectionsRemaining = 5;
    await expect(getBrokerClient(baseConfig)).rejects.toThrow();
    expect(socketState.clientIdSequence).toEqual([42, 43, 44]);
  });
});
