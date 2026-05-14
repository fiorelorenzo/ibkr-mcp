import { describe, it, expect } from "vitest";
import { getOptionChain } from "../../src/ibkr/chain.js";
import type { BrokerClient } from "../../src/ibkr/connection.js";

function mkClient(overrides: Partial<BrokerClient>): BrokerClient {
  return {
    connect: async () => undefined,
    disconnect: async () => undefined,
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

describe("getOptionChain", () => {
  it("filters to the requested expiry and assembles calls + puts", async () => {
    const client = mkClient({
      reqSecDefOptParams: async () => ({
        exchange: "SMART",
        underlyingConId: 1,
        tradingClass: "AAPL",
        multiplier: "100",
        expirations: ["20270115", "20270219"],
        strikes: [140, 150, 160],
      }),
      reqMktData: async (contract) => {
        const c = contract as { right: string; strike: number };
        const base = c.strike === 150 ? 10 : c.strike === 140 ? 15 : 5;
        const adj = c.right === "C" ? 0 : 0.5;
        return {
          bid: base + adj,
          ask: base + adj + 0.1,
          delta: c.right === "C" ? 0.5 : -0.5,
          iv: 0.3,
        };
      },
    });
    const chain = await getOptionChain(client, "AAPL", "2027-01-15");
    expect(chain.symbol).toBe("AAPL");
    expect(chain.expiry).toBe("20270115");
    expect(chain.strikes).toEqual([140, 150, 160]);
    expect(chain.calls).toHaveLength(3);
    expect(chain.puts).toHaveLength(3);
    const call150 = chain.calls.find((c) => c.strike === 150);
    expect(call150?.bid).toBe(10);
    expect(call150?.delta).toBe(0.5);
    const put150 = chain.puts.find((p) => p.strike === 150);
    expect(put150?.bid).toBe(10.5);
    expect(put150?.delta).toBe(-0.5);
  });

  it("throws when the requested expiry is not in the chain", async () => {
    const client = mkClient({
      reqSecDefOptParams: async () => ({
        exchange: "SMART",
        underlyingConId: 1,
        tradingClass: "AAPL",
        multiplier: "100",
        expirations: ["20270115"],
        strikes: [150],
      }),
    });
    await expect(getOptionChain(client, "AAPL", "2026-12-19")).rejects.toThrow(/no matching expiry/i);
  });

  it("accepts compact YYYYMMDD expiry directly", async () => {
    const client = mkClient({
      reqSecDefOptParams: async () => ({
        exchange: "SMART",
        underlyingConId: 1,
        tradingClass: "AAPL",
        multiplier: "100",
        expirations: ["20270115"],
        strikes: [150],
      }),
      reqMktData: async () => ({ bid: 1, ask: 1.1 }),
    });
    const chain = await getOptionChain(client, "AAPL", "20270115");
    expect(chain.expiry).toBe("20270115");
  });
});
