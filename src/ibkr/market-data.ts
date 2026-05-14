import type { BrokerClient } from "./connection.js";
import type { MarketDataSnapshot } from "./types.js";
import { yahooClient } from "../market-context/yahoo.js";

export interface MarketDataOptions {
  /** Comma-separated generic tick codes (see IB docs). */
  genericTicks?: string;
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Request a market data snapshot for a contract. For options, the IB
 * "tickOptionComputation" callback supplies model Greeks + IV; the
 * underlying socket wrapper accumulates these and returns them on the
 * snapshot object.
 *
 * Stock-only fallback: when IBKR returns no usable price (typical
 * outside RTH on paper accounts without market-data subscriptions),
 * fall back to a delayed Yahoo quote and tag the response with
 * `source: "yahoo-delayed"` and `delayed: true`. Option contracts are
 * NOT backfilled — Yahoo's option data is unreliable, and the caller is
 * better served knowing the broker had no Greeks.
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

  const c = (contract ?? {}) as { secType?: string; symbol?: string };
  const isStock = (c.secType ?? "STK") === "STK";
  const hasPrice =
    isFinitePositive(out.bid) || isFinitePositive(out.ask) || isFinitePositive(out.last);

  if (isStock && !hasPrice && c.symbol) {
    try {
      const q = (await yahooClient.quote(c.symbol)) as {
        regularMarketPrice?: number | null;
      };
      const px = q?.regularMarketPrice;
      if (isFinitePositive(px)) {
        out.bid = px;
        out.ask = px;
        out.last = px;
        out.source = "yahoo-delayed";
        out.delayed = true;
        return out;
      }
    } catch {
      // Swallow — fall through to the ibkr-empty response below.
    }
  }

  out.source = "ibkr";
  out.delayed = false;
  return out;
}
