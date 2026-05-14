import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/market-context/yahoo.js", () => ({
  yahooClient: {
    quote: vi.fn(),
    search: vi.fn(),
  },
}));

import { resolveYahooQuote } from "../../src/market-context/yahoo-resolve.js";
import { yahooClient } from "../../src/market-context/yahoo.js";

beforeEach(() => {
  vi.mocked(yahooClient.quote).mockReset();
  vi.mocked(yahooClient.search).mockReset();
});

describe("resolveYahooQuote", () => {
  it("resolves SPX → ^GSPC via caret-prefix when direct quote returns no price", async () => {
    vi.mocked(yahooClient.quote).mockImplementation((async (s: string) => {
      if (s === "SPX") return { symbol: "SPX", regularMarketPrice: null } as never;
      if (s === "^SPX") throw new Error("Not found");
      if (s === "^GSPC")
        return {
          symbol: "^GSPC",
          regularMarketPrice: 5800.42,
          longName: "S&P 500",
        } as never;
      return null as never;
    }) as never);
    vi.mocked(yahooClient.search).mockResolvedValue({
      quotes: [{ symbol: "^GSPC", quoteType: "INDEX", longname: "S&P 500" }],
    } as never);
    const r = await resolveYahooQuote("SPX");
    expect(r).not.toBeNull();
    expect(r!.resolvedSymbol).toBe("^GSPC");
    expect(r!.price).toBe(5800.42);
    expect(r!.isExact).toBe(false);
  });

  it("resolves a direct quote without proxying", async () => {
    vi.mocked(yahooClient.quote).mockResolvedValue({
      symbol: "AAPL",
      regularMarketPrice: 195.5,
      longName: "Apple Inc.",
    } as never);
    const r = await resolveYahooQuote("AAPL");
    expect(r!.resolutionMethod).toBe("direct");
    expect(r!.isExact).toBe(true);
    expect(r!.resolvedSymbol).toBe("AAPL");
    expect(r!.price).toBe(195.5);
  });

  it("resolves XSP via search when neither direct nor caret-prefix work", async () => {
    vi.mocked(yahooClient.quote).mockImplementation((async (s: string) => {
      if (s === "XSP") throw new Error("Not found");
      if (s === "^XSP") return { symbol: "^XSP", regularMarketPrice: null } as never;
      if (s === "SPY")
        return {
          symbol: "SPY",
          regularMarketPrice: 580.12,
          longName: "SPDR S&P 500 ETF Trust",
        } as never;
      return null as never;
    }) as never);
    vi.mocked(yahooClient.search).mockResolvedValue({
      quotes: [{ symbol: "SPY", quoteType: "ETF", shortname: "SPY" }],
    } as never);
    const r = await resolveYahooQuote("XSP");
    expect(r!.resolutionMethod).toBe("search-best-match");
    expect(r!.resolvedSymbol).toBe("SPY");
    expect(r!.isExact).toBe(false);
  });

  it("returns null when search returns no usable quotes", async () => {
    vi.mocked(yahooClient.quote).mockRejectedValue(new Error("Not found"));
    vi.mocked(yahooClient.search).mockResolvedValue({ quotes: [] } as never);
    const r = await resolveYahooQuote("BOGUS");
    expect(r).toBeNull();
  });

  it("uses caret-prefix path for VIX → ^VIX", async () => {
    vi.mocked(yahooClient.quote).mockImplementation((async (s: string) => {
      if (s === "VIX") return { symbol: "VIX", regularMarketPrice: null } as never;
      if (s === "^VIX")
        return { symbol: "^VIX", regularMarketPrice: 18.42 } as never;
      return null as never;
    }) as never);
    const r = await resolveYahooQuote("VIX");
    expect(r!.resolutionMethod).toBe("caret-prefix");
    expect(r!.resolvedSymbol).toBe("^VIX");
    expect(r!.price).toBe(18.42);
    expect(r!.isExact).toBe(false);
  });
});
