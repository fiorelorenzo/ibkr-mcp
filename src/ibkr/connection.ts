import type { Config } from "../config.js";

export interface BrokerClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  // primitives — implemented per backend
  reqAccountSummary(): Promise<unknown>;
  reqPositions(): Promise<unknown[]>;
  reqMktData(contract: unknown, genericTicks?: string): Promise<unknown>;
  reqSecDefOptParams(symbol: string): Promise<unknown>;
  reqHistoricalData(contract: unknown, query: unknown): Promise<unknown[]>;
  placeOrder(contract: unknown, order: unknown): Promise<unknown>;
  cancelOrder(orderId: number): Promise<void>;
  reqAllOpenOrders(): Promise<unknown[]>;
}

let clientPromise: Promise<BrokerClient> | null = null;

export async function getBrokerClient(config: Config): Promise<BrokerClient> {
  if (!clientPromise) {
    clientPromise = createClient(config);
  }
  return clientPromise;
}

export function resetBrokerClient(): void {
  clientPromise = null;
}

async function createClient(config: Config): Promise<BrokerClient> {
  if (config.IBKR_MODE === "socket") {
    const { createSocketClient } = await import("./socket.js");
    return createSocketClient(config);
  }
  throw new Error(
    "IBKR_MODE=oauth not implemented in v0.1; set IBKR_MODE=socket and start TWS/Gateway",
  );
}
