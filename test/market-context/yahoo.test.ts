import { describe, it, expect, vi } from "vitest";

vi.mock("yahoo-finance2", () => ({
  default: function YahooFinance() {
    return {
      quote: vi.fn().mockResolvedValue({ symbol: "AAPL", regularMarketPrice: 195.5 }),
      quoteSummary: vi.fn().mockResolvedValue({
        summaryDetail: { fiftyTwoWeekHigh: 200, fiftyTwoWeekLow: 150 },
      }),
    };
  },
}));

import { yahooClient } from "../../src/market-context/yahoo.js";

describe("yahooClient", () => {
  it("forwards quote", async () => {
    const q = (await yahooClient.quote("AAPL")) as { regularMarketPrice: number };
    expect(q.regularMarketPrice).toBe(195.5);
  });
});
