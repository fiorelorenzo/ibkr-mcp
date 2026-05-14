import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/market-context/yahoo.js", () => ({
  yahooClient: {
    quote: vi.fn(),
    search: vi.fn(),
  },
}));

import { getMarketData } from "../../src/ibkr/market-data.js";
import { yahooClient } from "../../src/market-context/yahoo.js";
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

beforeEach(() => {
  vi.mocked(yahooClient.quote).mockReset();
  vi.mocked(yahooClient.search).mockReset();
  vi.mocked(yahooClient.search).mockResolvedValue({ quotes: [] } as never);
});

describe("getMarketData", () => {
  it("returns normalized snapshot for an OPT contract with Greeks (no Yahoo fallback for options)", async () => {
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
    expect(md.source).toBe("ibkr");
    expect(md.delayed).toBe(false);
    expect(yahooClient.quote).not.toHaveBeenCalled();
  });

  it("passes through a stock snapshot without Greeks and marks source ibkr when prices present", async () => {
    const client = mkClient(async () => ({ bid: 175, ask: 175.05, last: 175.02 }));
    const md = await getMarketData(client, { symbol: "AAPL", secType: "STK" });
    expect(md.bid).toBe(175);
    expect(md.ask).toBe(175.05);
    expect(md.last).toBe(175.02);
    expect(md.source).toBe("ibkr");
    expect(md.delayed).toBe(false);
    expect(yahooClient.quote).not.toHaveBeenCalled();
  });

  it("forwards genericTicks string to the broker primitive", async () => {
    let received: { contract: unknown; ticks: string | undefined } | null = null;
    const client = mkClient(async (contract, ticks) => {
      received = { contract, ticks };
      return { bid: 1, ask: 1, last: 1 };
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

  it("falls back to Yahoo when IBKR returns empty/NaN for a STOCK (market closed)", async () => {
    const client = mkClient(async () => ({ bid: NaN, ask: NaN, last: NaN }));
    vi.mocked(yahooClient.quote).mockResolvedValue({
      symbol: "AAPL",
      regularMarketPrice: 195.5,
    } as never);
    const md = await getMarketData(client, { symbol: "AAPL", secType: "STK" });
    expect(yahooClient.quote).toHaveBeenCalledWith("AAPL");
    expect(md.source).toBe("yahoo-delayed");
    expect(md.delayed).toBe(true);
    expect(md.bid).toBe(195.5);
    expect(md.ask).toBe(195.5);
    expect(md.last).toBe(195.5);
  });

  it("does NOT fall back to Yahoo for option contracts even when IBKR is empty (returns 'unavailable')", async () => {
    const client = mkClient(async () => ({}));
    const md = await getMarketData(client, {
      symbol: "AAPL",
      secType: "OPT",
      right: "C",
      strike: 150,
      expiry: "20270115",
    });
    expect(yahooClient.quote).not.toHaveBeenCalled();
    expect(md.source).toBe("unavailable");
    expect(md.delayed).toBe(false);
  });

  it("returns 'unavailable' when IBKR is empty and Yahoo also has no price (no fabricated values)", async () => {
    const client = mkClient(async () => ({}));
    vi.mocked(yahooClient.quote).mockResolvedValue({
      symbol: "AAPL",
      regularMarketPrice: null,
    } as never);
    const md = await getMarketData(client, { symbol: "AAPL", secType: "STK" });
    expect(md.source).toBe("unavailable");
    expect(md.delayed).toBe(false);
    expect(md.bid).toBeUndefined();
    expect(md.ask).toBeUndefined();
    expect(md.last).toBeUndefined();
  });

  it("falls back to Yahoo when IBKR throws subscription error on stock", async () => {
    const client = mkClient(async () => {
      throw new Error("Market data not subscribed");
    });
    vi.mocked(yahooClient.quote).mockResolvedValue({
      symbol: "LUNR",
      regularMarketPrice: 24.5,
    } as never);
    const md = await getMarketData(client, { symbol: "LUNR", secType: "STK" });
    expect(md.source).toBe("yahoo-delayed");
    expect(md.last).toBe(24.5);
  });

  it("resolves VIX (IND) via the generic Yahoo cascade — caret-prefix → ^VIX", async () => {
    const client = mkClient(async () => {
      throw new Error("No subscription");
    });
    vi.mocked(yahooClient.quote).mockImplementation((async (s: string) => {
      if (s === "VIX") return { symbol: "VIX", regularMarketPrice: null } as never;
      if (s === "^VIX")
        return { symbol: "^VIX", regularMarketPrice: 18.42 } as never;
      return null as never;
    }) as never);
    const md = await getMarketData(client, { symbol: "VIX", secType: "IND" });
    expect(yahooClient.quote).toHaveBeenCalledWith("^VIX");
    expect(md.source).toBe("yahoo-delayed");
    expect(md.last).toBe(18.42);
    expect(md.resolvedSymbol).toBe("^VIX");
    expect(md.resolutionMethod).toBe("caret-prefix");
    expect(md.isExactSymbol).toBe(false);
  });

  it("returns source 'unavailable' when both IBKR throws AND Yahoo returns null price", async () => {
    const client = mkClient(async () => {
      throw new Error("subscription");
    });
    vi.mocked(yahooClient.quote).mockResolvedValue({
      symbol: "XSP",
      regularMarketPrice: null,
    } as never);
    const md = await getMarketData(client, { symbol: "XSP", secType: "STK" });
    expect(md.source).toBe("unavailable");
    expect(md.error).toContain("subscription");
  });

  it("does NOT throw for option contract with no data — returns 'unavailable'", async () => {
    const client = mkClient(async () => {
      throw new Error("subscription");
    });
    const md = await getMarketData(client, {
      symbol: "NFLX",
      secType: "OPT",
      right: "C",
      strike: 100,
      expiry: "2026-06-05",
    });
    expect(md.source).toBe("unavailable");
    expect(yahooClient.quote).not.toHaveBeenCalled();
  });
});
