import type { Config } from "../config.js";

export interface BrokerClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /**
   * Cheap liveness probe. Returns false if the underlying socket is closed
   * or a roundtrip ping fails. Should never throw.
   */
  isAlive(): Promise<boolean>;
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

const MAX_CLIENT_ID_ATTEMPTS = 3;

let clientPromise: Promise<BrokerClient> | null = null;

export async function getBrokerClient(config: Config): Promise<BrokerClient> {
  if (clientPromise) {
    try {
      const cached = await clientPromise;
      if (await cached.isAlive()) return cached;
      // stale — drop singleton and reconnect
      try {
        await cached.disconnect();
      } catch {
        /* ignore */
      }
    } catch {
      /* previous attempt failed entirely — fall through and recreate */
    }
    clientPromise = null;
  }
  clientPromise = createClientWithRotation(config);
  try {
    return await clientPromise;
  } catch (err) {
    // failed connect should not poison the singleton — clear so the next
    // call attempts a fresh connection.
    clientPromise = null;
    throw err;
  }
}

export async function resetBrokerClient(): Promise<void> {
  if (clientPromise) {
    try {
      const c = await clientPromise;
      await c.disconnect();
    } catch {
      /* ignore */
    }
    clientPromise = null;
  }
}

/**
 * Wrap a broker operation so that, if it fails with a likely dead-socket
 * error, we reset the singleton, reconnect, and retry exactly once.
 */
export async function withBrokerRetry<T>(
  config: Config,
  op: (client: BrokerClient) => Promise<T>,
): Promise<T> {
  const client = await getBrokerClient(config);
  try {
    return await op(client);
  } catch (err) {
    if (!isLikelyDeadSocketError(err)) throw err;
    await resetBrokerClient();
    const fresh = await getBrokerClient(config);
    return await op(fresh);
  }
}

export function isLikelyDeadSocketError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("not connected") ||
    m.includes("disconnected") ||
    m.includes("econnreset") ||
    m.includes("epipe") ||
    m.includes("socket closed")
  );
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

/**
 * Try to create a client up to MAX_CLIENT_ID_ATTEMPTS times, rotating
 * the clientId by +1 each retry. IBKR may reject a clientId that is
 * still server-side allocated from a previous session; bumping it
 * usually clears the handshake.
 */
async function createClientWithRotation(config: Config): Promise<BrokerClient> {
  const baseId = config.IBKR_CLIENT_ID;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_CLIENT_ID_ATTEMPTS; attempt++) {
    const id = baseId + attempt;
    const attemptConfig: Config = { ...config, IBKR_CLIENT_ID: id };
    try {
      return await createClient(attemptConfig);
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_CLIENT_ID_ATTEMPTS - 1) break;
      console.error(
        `ibkr-mcp: clientId ${id} rejected (${
          err instanceof Error ? err.message : String(err)
        }), retrying with ${id + 1}`,
      );
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? "unknown error creating broker client"));
}
