import { describe, it, expect } from "vitest";
import { getAccountSummary, getPositions } from "../../src/ibkr/account.js";
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

describe("getAccountSummary", () => {
  it("normalizes raw IB tags into AccountSummary shape", async () => {
    const client = mkClient({
      reqAccountSummary: async () => ({
        NetLiquidation: "105000",
        BuyingPower: "200000",
        ExcessLiquidity: "95000",
        InitMarginReq: "5000",
        MaintMarginReq: "4000",
        AccountCode: "DU1234567",
      }),
    });
    const s = await getAccountSummary(client);
    expect(s).toEqual({
      accountId: "DU1234567",
      netLiq: 105_000,
      buyingPower: 200_000,
      excessLiquidity: 95_000,
      initMargin: 5_000,
      maintMargin: 4_000,
    });
  });

  it("defaults missing tags to zero / empty string", async () => {
    const client = mkClient({ reqAccountSummary: async () => ({}) });
    const s = await getAccountSummary(client);
    expect(s).toEqual({
      accountId: "",
      netLiq: 0,
      buyingPower: 0,
      excessLiquidity: 0,
      initMargin: 0,
      maintMargin: 0,
    });
  });
});

describe("getPositions", () => {
  it("normalizes a stock position", async () => {
    const client = mkClient({
      reqPositions: async () => [
        {
          symbol: "AAPL",
          secType: "STK",
          position: 100,
          avgCost: 150.5,
          marketPrice: 175.25,
          unrealizedPNL: 2475,
        },
      ],
    });
    const pos = await getPositions(client);
    expect(pos).toHaveLength(1);
    expect(pos[0]).toEqual({
      symbol: "AAPL",
      secType: "STK",
      quantity: 100,
      avgCost: 150.5,
      marketPrice: 175.25,
      unrealizedPnl: 2475,
    });
  });

  it("normalizes an option position with Greeks pass-through", async () => {
    const client = mkClient({
      reqPositions: async () => [
        {
          symbol: "AAPL",
          secType: "OPT",
          right: "C",
          strike: 150,
          expiry: "20270115",
          position: 1,
          avgCost: 4500,
          marketPrice: 50.25,
          unrealizedPNL: 525,
          modelGreeks: { delta: 0.85, gamma: 0.01, theta: -0.02, vega: 0.3, iv: 0.28 },
        },
      ],
    });
    const pos = await getPositions(client);
    expect(pos).toHaveLength(1);
    const opt = pos[0];
    if (opt.secType !== "OPT") throw new Error("expected OPT");
    expect(opt.symbol).toBe("AAPL");
    expect(opt.right).toBe("C");
    expect(opt.strike).toBe(150);
    // Compact YYYYMMDD must be normalized to ISO YYYY-MM-DD.
    expect(opt.expiry).toBe("2027-01-15");
    expect(opt.quantity).toBe(1);
    expect(opt.greeks).toEqual({
      delta: 0.85,
      gamma: 0.01,
      theta: -0.02,
      vega: 0.3,
      iv: 0.28,
    });
  });

  it("returns empty array when there are no positions", async () => {
    const client = mkClient({ reqPositions: async () => [] });
    expect(await getPositions(client)).toEqual([]);
  });

  it("normalizes compact YYYYMMDD expiry to ISO YYYY-MM-DD", async () => {
    const client = mkClient({
      reqPositions: async () => [
        {
          symbol: "NFLX",
          secType: "OPT",
          right: "C",
          strike: 72,
          expiry: "20270617",
          position: 1,
          avgCost: 5000,
          marketPrice: 55,
          unrealizedPNL: 500,
        },
      ],
    });
    const pos = await getPositions(client);
    if (pos[0].secType !== "OPT") throw new Error("expected OPT");
    expect(pos[0].expiry).toBe("2027-06-17");
  });

  it("falls back to lastTradeDateOrContractMonth and normalizes it", async () => {
    const client = mkClient({
      reqPositions: async () => [
        {
          symbol: "AAPL",
          secType: "OPT",
          right: "C",
          strike: 150,
          lastTradeDateOrContractMonth: "20270115",
          position: 1,
          avgCost: 4500,
          marketPrice: 50,
          unrealizedPNL: 500,
        },
      ],
    });
    const pos = await getPositions(client);
    if (pos[0].secType !== "OPT") throw new Error("expected OPT");
    expect(pos[0].expiry).toBe("2027-01-15");
  });
});
