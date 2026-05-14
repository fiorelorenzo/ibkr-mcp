import type { BrokerClient } from "./connection.js";
import type { MarketDataSnapshot } from "./types.js";

export interface MarketDataOptions {
  /** Comma-separated generic tick codes (see IB docs). */
  genericTicks?: string;
}

/**
 * Request a market data snapshot for a contract. For options, the IB
 * "tickOptionComputation" callback supplies model Greeks + IV; the
 * underlying socket wrapper accumulates these and returns them on the
 * snapshot object.
 */
export async function getMarketData(
  client: BrokerClient,
  contract: unknown,
  opts: MarketDataOptions = {},
): Promise<MarketDataSnapshot> {
  const raw = (await client.reqMktData(contract, opts.genericTicks)) as MarketDataSnapshot;
  // Filter undefined keys for a tidy response.
  const out: MarketDataSnapshot = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined && v !== null && (typeof v !== "number" || Number.isFinite(v))) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}
