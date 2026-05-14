import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/market-context/universe.js", () => ({
  getUniverseConstituents: vi.fn().mockResolvedValue(["AAPL", "MSFT", "TSLA"]),
}));
vi.mock("../../src/market-context/yahoo.js", () => ({
  yahooClient: {
    quote: vi.fn().mockImplementation((s: string) => ({
      symbol: s,
      regularMarketPrice: s === "AAPL" ? 195 : s === "MSFT" ? 410 : 220,
      marketCap: s === "AAPL" ? 3e12 : s === "MSFT" ? 3e12 : 7e11,
    })),
  },
}));

import { screenUniverse } from "../../src/market-context/screen.js";

describe("screenUniverse", () => {
  it("filters by price range", async () => {
    const out = await screenUniverse({
      universe: "sp500",
      filters: { minPrice: 200, maxPrice: 500 },
    });
    expect(out.map((r) => r.symbol)).toEqual(expect.arrayContaining(["MSFT", "TSLA"]));
    expect(out.map((r) => r.symbol)).not.toContain("AAPL");
  });
});
