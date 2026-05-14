import { describe, it, expect } from "vitest";
import { getMarketData } from "../../src/ibkr/market-data.js";
import type { BrokerClient } from "../../src/ibkr/connection.js";

function mkClient(reqMktData: BrokerClient["reqMktData"]): BrokerClient {
  return {
    connect: async () => undefined,
    disconnect: async () => undefined,
    reqAccountSummary: async () => ({}),
    reqPositions: async () => [],
    reqMktData,
    reqSecDefOptParams: async () => ({}),
    reqHistoricalData: async () => [],
    placeOrder: async () => ({}),
    cancelOrder: async () => undefined,
    reqAllOpenOrders: async () => [],
  };
}

describe("getMarketData", () => {
  it("returns normalized snapshot for an OPT contract with Greeks", async () => {
    const client = mkClient(async () => ({
      bid: 1.25,
      ask: 1.4,
      last: 1.3,
      close: 1.28,
      volume: 1000,
      delta: 0.45,
      gamma: 0.02,
      theta: -0.05,
      vega: 0.12,
      iv: 0.32,
      undPrice: 150,
    }));
    const md = await getMarketData(client, {
      symbol: "AAPL",
      secType: "OPT",
      right: "C",
      strike: 150,
      expiry: "20270115",
    });
    expect(md.bid).toBe(1.25);
    expect(md.ask).toBe(1.4);
    expect(md.last).toBe(1.3);
    expect(md.delta).toBe(0.45);
    expect(md.iv).toBe(0.32);
    expect(md.undPrice).toBe(150);
  });

  it("passes through a stock snapshot without Greeks", async () => {
    const client = mkClient(async () => ({ bid: 175, ask: 175.05, last: 175.02 }));
    const md = await getMarketData(client, { symbol: "AAPL", secType: "STK" });
    expect(md).toEqual({ bid: 175, ask: 175.05, last: 175.02 });
  });

  it("forwards genericTicks string to the broker primitive", async () => {
    let received: { contract: unknown; ticks: string | undefined } | null = null;
    const client = mkClient(async (contract, ticks) => {
      received = { contract, ticks };
      return {};
    });
    await getMarketData(
      client,
      { symbol: "AAPL", secType: "STK" },
      { genericTicks: "100,101,104,106" },
    );
    expect(received).toEqual({
      contract: { symbol: "AAPL", secType: "STK" },
      ticks: "100,101,104,106",
    });
  });
});
