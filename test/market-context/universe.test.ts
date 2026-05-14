import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cacheDir = join(tmpdir(), "ibkr-mcp-test-cache");
process.env.IBKR_MCP_CACHE_DIR = cacheDir;

vi.mock("../../src/market-context/yahoo.js", () => ({
  yahooClient: {
    summary: vi.fn().mockResolvedValue({
      topHoldings: { holdings: [{ symbol: "AAPL" }, { symbol: "MSFT" }, { symbol: "NVDA" }] },
    }),
  },
}));

import { getUniverseConstituents } from "../../src/market-context/universe.js";

describe("getUniverseConstituents", () => {
  beforeEach(() => {
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true });
  });
  it("fetches S&P 500 constituents via SPY holdings", async () => {
    const list = await getUniverseConstituents("sp500");
    expect(list).toContain("AAPL");
    expect(list.length).toBeGreaterThan(0);
  });
  it("caches result on disk and serves second call from cache", async () => {
    await getUniverseConstituents("sp500");
    const cached = await getUniverseConstituents("sp500");
    expect(cached).toContain("AAPL");
  });
});
