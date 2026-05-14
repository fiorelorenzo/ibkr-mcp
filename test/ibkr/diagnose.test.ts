import { describe, it, expect } from "vitest";
import { diagnoseConnection } from "../../src/ibkr/diagnose.js";
import type { BrokerClient } from "../../src/ibkr/connection.js";

function mkClient(overrides: Partial<BrokerClient>): BrokerClient {
  return {
    connect: async () => undefined,
    disconnect: async () => undefined,
    isAlive: async () => true,
    reqAccountSummary: async () => ({}),
    reqPositions: async () => [],
    reqMktData: async () => ({}),
    reqSecDefOptParams: async () => ({}),
    reqHistoricalData: async () => [],
    placeOrder: async () => ({}),
    cancelOrder: async () => undefined,
    reqAllOpenOrders: async () => [],
    ...overrides,
  };
}

describe("diagnoseConnection", () => {
  it("happy path — SPY stock + option both succeed", async () => {
    const client = mkClient({
      isConnected: () => true,
      ping: async () => 12,
      reqMktData: async (contract) => {
        const c = contract as { secType: string };
        if (c.secType === "STK") return { bid: 580.1, ask: 580.2, last: 580.15 };
        return { bid: 5.1, ask: 5.25, delta: 0.5, iv: 0.18 };
      },
      getRecentErrors: () => [],
    });
    const r = await diagnoseConnection(client);
    expect(r.connected).toBe(true);
    expect(r.pingMs).toBe(12);
    expect(r.stockTest.ok).toBe(true);
    expect(r.stockTest.bid).toBe(580.1);
    expect(r.optionTest.ok).toBe(true);
    expect(r.optionTest.delta).toBe(0.5);
    expect(r.recentErrors).toEqual([]);
  });

  it("sad path — option returns no Greeks → ok=false with explanatory reason", async () => {
    const client = mkClient({
      isConnected: () => true,
      ping: async () => 8,
      reqMktData: async (contract) => {
        const c = contract as { secType: string };
        if (c.secType === "STK") return { bid: 580, ask: 580.05, last: 580 };
        return { bid: 5, ask: 5.2 }; // bid/ask only, no Greeks
      },
      getRecentErrors: () => [
        { timestamp: Date.now(), message: "Market data not subscribed", code: 354 },
      ],
    });
    const r = await diagnoseConnection(client);
    expect(r.stockTest.ok).toBe(true);
    expect(r.optionTest.ok).toBe(false);
    expect(r.optionTest.reason).toMatch(/greeks/i);
    expect(r.recentErrors).toHaveLength(1);
  });

  it("never throws when stock probe rejects", async () => {
    const client = mkClient({
      isConnected: () => true,
      ping: async () => {
        throw new Error("dead");
      },
      reqMktData: async () => {
        throw new Error("Market data not subscribed");
      },
    });
    const r = await diagnoseConnection(client);
    expect(r.pingError).toBe("dead");
    expect(r.stockTest.ok).toBe(false);
    expect(r.optionTest.ok).toBe(false);
    expect(r.optionTest.reason).toMatch(/skipped|no spot/i);
  });
});
