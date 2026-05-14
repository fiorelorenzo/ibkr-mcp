import type { BrokerClient } from "./connection.js";
import type { OptionChain, OptionChainStrike, MarketDataSnapshot } from "./types.js";

/**
 * Concurrency limit for per-strike market data fetches. IB throttles
 * around ~50 concurrent subscriptions for retail accounts; 10 is a safe
 * default that keeps a chain of 50 strikes well under a few seconds.
 */
const DEFAULT_CONCURRENCY = 10;

function toCompactExpiry(expiry: string): string {
  // Accept "YYYY-MM-DD" or "YYYYMMDD".
  if (/^\d{8}$/.test(expiry)) return expiry;
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return expiry.replace(/-/g, "");
  throw new Error(`unsupported expiry format: ${expiry} (use YYYY-MM-DD or YYYYMMDD)`);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface OptionChainOptions {
  /** Max concurrent market data requests per side (call/put). Default 10. */
  concurrency?: number;
}

export async function getOptionChain(
  client: BrokerClient,
  symbol: string,
  expiry: string,
  opts: OptionChainOptions = {},
): Promise<OptionChain> {
  const compactExpiry = toCompactExpiry(expiry);
  const params = (await client.reqSecDefOptParams(symbol)) as {
    expirations: string[];
    strikes: number[];
  };
  if (!params.expirations?.includes(compactExpiry)) {
    throw new Error(
      `no matching expiry ${compactExpiry} for ${symbol} (available: ${(params.expirations ?? []).join(", ")})`,
    );
  }
  const strikes = [...params.strikes].sort((a, b) => a - b);
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;

  const fetchSide = async (right: "C" | "P"): Promise<OptionChainStrike[]> =>
    mapWithConcurrency(strikes, concurrency, async (strike) => {
      const md = (await client.reqMktData({
        symbol,
        secType: "OPT",
        right,
        strike,
        expiry: compactExpiry,
      })) as MarketDataSnapshot;
      return {
        strike,
        bid: md.bid,
        ask: md.ask,
        last: md.last,
        delta: md.delta,
        gamma: md.gamma,
        theta: md.theta,
        vega: md.vega,
        iv: md.iv,
      };
    });

  const [calls, puts] = await Promise.all([fetchSide("C"), fetchSide("P")]);
  return { symbol, expiry: compactExpiry, strikes, calls, puts };
}
