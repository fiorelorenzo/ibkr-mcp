import { describe, it, expect } from "vitest";
import { ANALYTICS_TOOL_DEFS } from "../../src/tools/analytics.tools.js";
import { MARKET_CONTEXT_TOOL_DEFS } from "../../src/tools/market-context.tools.js";

describe("tool registration", () => {
  it("registers 9 analytics tools", () => {
    expect(ANALYTICS_TOOL_DEFS).toHaveLength(9);
  });

  it("registers 6 market-context tools", () => {
    expect(MARKET_CONTEXT_TOOL_DEFS).toHaveLength(6);
  });

  it("registers 15 tools across analytics + market-context", () => {
    const all = [...ANALYTICS_TOOL_DEFS, ...MARKET_CONTEXT_TOOL_DEFS];
    expect(all).toHaveLength(15);
  });

  it("bs_price handler returns a price near 2.49 for an ATM call (30d, 20% IV)", async () => {
    const bsPriceTool = ANALYTICS_TOOL_DEFS.find((t) => t.name === "bs_price")!;
    const result = (await bsPriceTool.handler({
      S: 100,
      K: 100,
      T: 30 / 365,
      r: 0.05,
      sigma: 0.2,
      right: "C",
    })) as { price: number };
    expect(result.price).toBeCloseTo(2.49, 1);
  });
});
