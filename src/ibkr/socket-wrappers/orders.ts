import { EventName } from "@stoqey/ib";
import type { SocketHandle } from "../socket.js";
import { withRequest } from "../socket.js";

export interface RawOpenOrder {
  orderId: number;
  contract: unknown;
  order: unknown;
  orderState: unknown;
}

export function buildOrderWrappers(handle: SocketHandle): {
  reqAllOpenOrders: () => Promise<RawOpenOrder[]>;
  placeOrder: (contract: unknown, order: unknown) => Promise<{ orderId: number }>;
  cancelOrder: (orderId: number) => Promise<void>;
} {
  const { api, ensureConnected, nextReqId } = handle;

  return {
    reqAllOpenOrders: async () => {
      await ensureConnected();
      return withRequest<RawOpenOrder[]>(api, {
        frameEvent: EventName.openOrder,
        endEvent: EventName.openOrderEnd,
        initial: [],
        onFrame: (buf, args) => {
          const [orderId, contract, order, orderState] = args as [
            number,
            unknown,
            unknown,
            unknown,
          ];
          buf.push({ orderId, contract, order, orderState });
        },
        fire: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (api as any).reqAllOpenOrders();
        },
      });
    },

    placeOrder: async (contract, order) => {
      await ensureConnected();
      const orderId = nextReqId();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api as any).placeOrder(orderId, contract, order);
      // We don't wait for orderStatus here — the caller can subscribe
      // separately via getOrderStatus(orderId). Return the id so they can.
      return { orderId };
    },

    cancelOrder: async (orderId) => {
      await ensureConnected();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api as any).cancelOrder(orderId);
    },
  };
}
