import type { BrokerClient } from "./connection.js";

export interface OrderGate {
  allowOrders: boolean;
}

export async function getLiveOrders(client: BrokerClient): Promise<unknown[]> {
  return client.reqAllOpenOrders();
}

export async function getOrderStatus(
  client: BrokerClient,
  orderId: number,
): Promise<unknown | null> {
  const all = (await client.reqAllOpenOrders()) as Array<{ orderId: number }>;
  return all.find((o) => o.orderId === orderId) ?? null;
}

export async function placeOrder(
  client: BrokerClient,
  contract: unknown,
  order: unknown,
  opts: OrderGate,
): Promise<unknown> {
  if (!opts.allowOrders) {
    throw new Error(
      "read-only mode: set IBKR_ALLOW_ORDERS=true to enable order placement",
    );
  }
  return client.placeOrder(contract, order);
}

export async function cancelOrder(
  client: BrokerClient,
  orderId: number,
  opts: OrderGate,
): Promise<void> {
  if (!opts.allowOrders) {
    throw new Error(
      "read-only mode: set IBKR_ALLOW_ORDERS=true to enable order cancellation",
    );
  }
  await client.cancelOrder(orderId);
}
