import { describe, it, expect } from "vitest";
import { ANALYTICS_TOOL_DEFS } from "../../src/tools/analytics.tools.js";
import { MARKET_CONTEXT_TOOL_DEFS } from "../../src/tools/market-context.tools.js";
import { buildIbkrTools } from "../../src/tools/ibkr.tools.js";
import { resetBrokerClient } from "../../src/ibkr/connection.js";
import type { Config } from "../../src/config.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    IBKR_MODE: "socket",
    IBKR_HOST: "127.0.0.1",
    IBKR_PORT: 4002,
    IBKR_CLIENT_ID: 42,
    IBKR_PAPER_TRADING: true,
    IBKR_ALLOW_ORDERS: false,
    IBKR_LOG_LEVEL: "info",
    ...overrides,
  } as Config;
}

describe("tool registration", () => {
  it("registers 9 analytics tools", () => {
    expect(ANALYTICS_TOOL_DEFS).toHaveLength(9);
  });

  it("registers 7 market-context tools", () => {
    expect(MARKET_CONTEXT_TOOL_DEFS).toHaveLength(7);
  });

  it("registers 13 IBKR tools", () => {
    const tools = buildIbkrTools(makeConfig());
    expect(tools).toHaveLength(13);
  });

  it("registers 29 tools in total", () => {
    const all = [
      ...ANALYTICS_TOOL_DEFS,
      ...MARKET_CONTEXT_TOOL_DEFS,
      ...buildIbkrTools(makeConfig()),
    ];
    expect(all).toHaveLength(29);
    // No duplicate names
    const names = all.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("exposes the resolve_symbol tool and it is callable", async () => {
    const tool = MARKET_CONTEXT_TOOL_DEFS.find((t) => t.name === "resolve_symbol");
    expect(tool).toBeDefined();
    expect(tool!.description).toMatch(/Yahoo/i);
    // Calling with a bogus symbol should not throw and should return a structured result.
    const result = (await tool!.handler({ symbol: "DEFINITELY_NOT_A_TICKER_XYZ" })) as {
      resolved: boolean;
    };
    expect(typeof result.resolved).toBe("boolean");
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

describe("IBKR read-only gate", () => {
  it("place_order throws read-only error when IBKR_ALLOW_ORDERS=false", async () => {
    const tools = buildIbkrTools(makeConfig({ IBKR_ALLOW_ORDERS: false }));
    const placeOrder = tools.find((t) => t.name === "place_order")!;
    await expect(
      placeOrder.handler({
        contract: { symbol: "AAPL" },
        order: { action: "BUY", totalQuantity: 1, orderType: "MKT" },
      }),
    ).rejects.toThrow(/read-only/);
  });

  it("cancel_order throws read-only error when IBKR_ALLOW_ORDERS=false", async () => {
    const tools = buildIbkrTools(makeConfig({ IBKR_ALLOW_ORDERS: false }));
    const cancelOrder = tools.find((t) => t.name === "cancel_order")!;
    await expect(cancelOrder.handler({ orderId: 1 })).rejects.toThrow(/read-only/);
  });

  it("place_order with IBKR_ALLOW_ORDERS=true does not throw read-only (fails for another reason — no broker)", async () => {
    resetBrokerClient();
    const tools = buildIbkrTools(
      makeConfig({ IBKR_ALLOW_ORDERS: true, IBKR_PORT: 1 }),
    );
    const placeOrder = tools.find((t) => t.name === "place_order")!;
    let caught: unknown;
    try {
      await placeOrder.handler({
        contract: { symbol: "AAPL" },
        order: { action: "BUY", totalQuantity: 1, orderType: "MKT" },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const msg = caught instanceof Error ? caught.message : String(caught);
    expect(msg).not.toMatch(/read-only/);
    resetBrokerClient();
  }, 10_000);
});
