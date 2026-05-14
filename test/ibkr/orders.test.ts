import { describe, it, expect, vi } from "vitest";
import {
  getLiveOrders,
  getOrderStatus,
  placeOrder,
  cancelOrder,
} from "../../src/ibkr/orders.js";
import type { BrokerClient } from "../../src/ibkr/connection.js";

function mkClient(overrides: Partial<BrokerClient>): BrokerClient {
  return {
    connect: async () => undefined,
    disconnect: async () => undefined,
    isAlive: async () => true,
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

describe("getLiveOrders", () => {
  it("returns the broker's open-orders list", async () => {
    const client = mkClient({
      reqAllOpenOrders: async () => [
        { orderId: 1, contract: { symbol: "AAPL" }, order: { action: "BUY" }, orderState: {} },
      ],
    });
    const orders = await getLiveOrders(client);
    expect(orders).toHaveLength(1);
  });
});

describe("getOrderStatus", () => {
  it("finds an order by orderId", async () => {
    const client = mkClient({
      reqAllOpenOrders: async () => [
        { orderId: 1, contract: {}, order: {}, orderState: { status: "Submitted" } },
        { orderId: 2, contract: {}, order: {}, orderState: { status: "Filled" } },
      ],
    });
    const o = await getOrderStatus(client, 2);
    expect(o).toBeTruthy();
    expect((o as { orderId: number }).orderId).toBe(2);
  });

  it("returns null when orderId is not in the list", async () => {
    const client = mkClient({ reqAllOpenOrders: async () => [] });
    expect(await getOrderStatus(client, 999)).toBeNull();
  });
});

describe("placeOrder", () => {
  it("throws in read-only mode (allowOrders: false)", async () => {
    const client = mkClient({});
    await expect(
      placeOrder(client, { symbol: "AAPL" }, { action: "BUY" }, { allowOrders: false }),
    ).rejects.toThrow(/read-only/);
  });

  it("calls through when allowOrders: true", async () => {
    const spy = vi.fn(async () => ({ orderId: 42 }));
    const client = mkClient({ placeOrder: spy });
    const r = await placeOrder(
      client,
      { symbol: "AAPL" },
      { action: "BUY" },
      { allowOrders: true },
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(r).toEqual({ orderId: 42 });
  });
});

describe("cancelOrder", () => {
  it("throws in read-only mode (allowOrders: false)", async () => {
    const client = mkClient({});
    await expect(cancelOrder(client, 7, { allowOrders: false })).rejects.toThrow(/read-only/);
  });

  it("calls through when allowOrders: true", async () => {
    const spy = vi.fn(async () => undefined);
    const client = mkClient({ cancelOrder: spy });
    await cancelOrder(client, 7, { allowOrders: true });
    expect(spy).toHaveBeenCalledWith(7);
  });
});
