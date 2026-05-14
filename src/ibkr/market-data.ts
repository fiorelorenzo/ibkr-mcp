import type { BrokerClient } from "./connection.js";
import type { MarketDataSnapshot } from "./types.js";
import { resolveYahooQuote } from "../market-context/yahoo-resolve.js";

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
 * Fallback rules:
 *  - When IBKR is **unusable** for a `STK` or `IND` contract — either the
 *    broker call threw (e.g. "Market data is not subscribed",
 *    "delayed market data is not available") OR every price field came
 *    back NaN — try the generic Yahoo-resolution cascade
 *    (direct quote → `^SYMBOL` → Yahoo Search best match). The proxy
 *    symbol that actually returned a price is surfaced on the response
 *    as `resolvedSymbol` (e.g. `VIX → ^VIX`, `SPX → ^GSPC`,
 *    `XSP → SPY`).
 *  - Option contracts are NOT backfilled (Yahoo's option chain is
 *    unreliable and Greeks would be missing).
 *  - If neither source has data, return a structured snapshot with
 *    `source: "unavailable"`. **This function never throws on missing data.**
 */
export async function getMarketData(
  client: BrokerClient,
  contract: unknown,
  opts: MarketDataOptions = {},
): Promise<MarketDataSnapshot> {
  const c = (contract ?? {}) as { secType?: string; symbol?: string };
  const secType = c.secType ?? "STK";
  const symbol = c.symbol;

  let ibkrSnapshot: MarketDataSnapshot | null = null;
  let ibkrError: Error | null = null;
  try {
    const raw = (await client.reqMktData(contract, opts.genericTicks)) as MarketDataSnapshot;
    // Filter undefined / non-finite numeric keys for a tidy response.
    const out: MarketDataSnapshot = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== undefined && v !== null && (typeof v !== "number" || Number.isFinite(v))) {
        (out as Record<string, unknown>)[k] = v;
      }
    }
    ibkrSnapshot = out;
  } catch (err) {
    ibkrError = err instanceof Error ? err : new Error(String(err));
  }

  const hasPrice =
    ibkrSnapshot !== null &&
    (isFinitePositive(ibkrSnapshot.bid) ||
      isFinitePositive(ibkrSnapshot.ask) ||
      isFinitePositive(ibkrSnapshot.last));

  const ibkrUnusable = ibkrError !== null || ibkrSnapshot === null || !hasPrice;

  if ((secType === "STK" || secType === "IND") && ibkrUnusable && symbol) {
    const resolved = await resolveYahooQuote(symbol);
    if (resolved) {
      const merged: MarketDataSnapshot = { ...(ibkrSnapshot ?? {}) };
      merged.bid = resolved.price;
      merged.ask = resolved.price;
      merged.last = resolved.price;
      merged.source = "yahoo-delayed";
      merged.delayed = true;
      merged.resolvedSymbol = resolved.resolvedSymbol;
      merged.resolutionMethod = resolved.resolutionMethod;
      if (resolved.longName) merged.longName = resolved.longName;
      merged.isExactSymbol = resolved.isExact;
      return merged;
    }
  }

  if (ibkrUnusable) {
    const unavailable: MarketDataSnapshot = { ...(ibkrSnapshot ?? {}) };
    unavailable.source = "unavailable";
    unavailable.delayed = false;
    if (ibkrError) {
      unavailable.error = ibkrError.message;
    }
    return unavailable;
  }

  // Happy path: IBKR returned usable prices.
  return { ...(ibkrSnapshot as MarketDataSnapshot), source: "ibkr", delayed: false };
}
