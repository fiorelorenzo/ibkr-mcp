import { describe, it, expect } from "vitest";
import { getHistoricalBars } from "../../src/ibkr/history.js";
import type { BrokerClient } from "../../src/ibkr/connection.js";

function mkClient(reqHistoricalData: BrokerClient["reqHistoricalData"]): BrokerClient {
  return {
    connect: async () => undefined,
    disconnect: async () => undefined,
    reqAccountSummary: async () => ({}),
    reqPositions: async () => [],
    reqMktData: async () => ({}),
    reqSecDefOptParams: async () => ({}),
    reqHistoricalData,
    placeOrder: async () => ({}),
    cancelOrder: async () => undefined,
    reqAllOpenOrders: async () => [],
  };
}

describe("getHistoricalBars", () => {
  it("returns normalized bars for a stock", async () => {
    const client = mkClient(async () => [
      { time: "20260413", open: 170, high: 172, low: 169, close: 171, volume: 1000 },
      { time: "20260414", open: 171, high: 173, low: 170, close: 172.5, volume: 1200 },
    ]);
    const bars = await getHistoricalBars(client, "AAPL", { duration: "30 D", barSize: "1 day" });
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({
      time: "20260413",
      open: 170,
      high: 172,
      low: 169,
      close: 171,
      volume: 1000,
    });
  });

  it("passes the contract + query through to the broker primitive", async () => {
    let received: { contract: unknown; query: unknown } | null = null;
    const client = mkClient(async (contract, query) => {
      received = { contract, query };
      return [];
    });
    await getHistoricalBars(client, "TSLA", {
      duration: "1 Y",
      barSize: "1 day",
      whatToShow: "TRADES",
    });
    expect(received).toMatchObject({
      contract: { symbol: "TSLA", secType: "STK", exchange: "SMART", currency: "USD" },
      query: { duration: "1 Y", barSize: "1 day", whatToShow: "TRADES" },
    });
  });

  it("returns empty array when no bars are returned", async () => {
    const client = mkClient(async () => []);
    expect(await getHistoricalBars(client, "AAPL", { duration: "1 D", barSize: "1 hour" })).toEqual([]);
  });
});
