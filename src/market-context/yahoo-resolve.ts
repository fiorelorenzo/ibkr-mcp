import { yahooClient } from "./yahoo.js";

export interface ResolvedQuote {
  /** The symbol literally requested */
  requestedSymbol: string;
  /** The symbol Yahoo actually returned a price for (e.g. "^GSPC" for "SPX") */
  resolvedSymbol: string;
  /** How the resolution was achieved */
  resolutionMethod: "direct" | "caret-prefix" | "search-best-match";
  price: number;
  /** True only when resolvedSymbol === requestedSymbol (no proxy). */
  isExact: boolean;
  /** Optional human-readable name if Yahoo returned it ("SPDR S&P 500 ETF Trust"). */
  longName?: string;
}

/**
 * Generic Yahoo-resolution cascade.
 *
 *  1. Direct quote on the literal symbol.
 *  2. `^SYMBOL` (CBOE / index convention on Yahoo).
 *  3. Yahoo Search → quote the first candidate that returns a finite price.
 *
 * Returns `null` if none of the steps yield a finite, positive price.
 * Never throws.
 */
export async function resolveYahooQuote(symbol: string): Promise<ResolvedQuote | null> {
  const candidates: Array<{ sym: string; method: ResolvedQuote["resolutionMethod"] }> = [
    { sym: symbol, method: "direct" },
    { sym: `^${symbol}`, method: "caret-prefix" },
  ];

  for (const { sym, method } of candidates) {
    try {
      const q = (await yahooClient.quote(sym)) as {
        regularMarketPrice?: number | null;
        longName?: string;
        symbol?: string;
      };
      const price = q?.regularMarketPrice;
      if (typeof price === "number" && Number.isFinite(price)) {
        const resolvedSymbol = q.symbol ?? sym;
        return {
          requestedSymbol: symbol,
          resolvedSymbol,
          resolutionMethod: method,
          price,
          isExact: resolvedSymbol === symbol,
          longName: q.longName,
        };
      }
    } catch {
      // try next
    }
  }

  // Last resort: search and pick the first quote with a price.
  try {
    const results = (await yahooClient.search(symbol)) as {
      quotes?: Array<{
        symbol: string;
        quoteType?: string;
        longname?: string;
        shortname?: string;
      }>;
    };
    for (const r of results?.quotes ?? []) {
      if (!r.symbol) continue;
      try {
        const q = (await yahooClient.quote(r.symbol)) as {
          regularMarketPrice?: number | null;
          longName?: string;
          symbol?: string;
        };
        const price = q?.regularMarketPrice;
        if (typeof price === "number" && Number.isFinite(price)) {
          const resolvedSymbol = q.symbol ?? r.symbol;
          return {
            requestedSymbol: symbol,
            resolvedSymbol,
            resolutionMethod: "search-best-match",
            price,
            isExact: resolvedSymbol === symbol,
            longName: q.longName ?? r.longname ?? r.shortname,
          };
        }
      } catch {
        // try next result
      }
    }
  } catch {
    // search itself failed
  }

  return null;
}
