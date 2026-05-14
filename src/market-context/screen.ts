import { getUniverseConstituents, type Universe } from "./universe.js";
import { yahooClient } from "./yahoo.js";

export interface ScreenFilters {
  minPrice?: number;
  maxPrice?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
}

export interface ScreenResult {
  symbol: string;
  price: number;
  marketCap: number | null;
}

export async function screenUniverse(input: {
  universe?: Universe;
  watchlist?: string[];
  filters: ScreenFilters;
}): Promise<ScreenResult[]> {
  const symbols =
    input.watchlist ?? (await getUniverseConstituents(input.universe ?? "sp500"));
  const results = await Promise.all(
    symbols.map(async (s) => {
      const q = (await yahooClient.quote(s)) as {
        symbol?: string;
        regularMarketPrice?: number;
        marketCap?: number;
      };
      return {
        symbol: s,
        price: q.regularMarketPrice ?? NaN,
        marketCap: q.marketCap ?? null,
      };
    }),
  );
  return results.filter((r) => {
    const { minPrice, maxPrice, minMarketCap, maxMarketCap } = input.filters;
    if (minPrice !== undefined && r.price < minPrice) return false;
    if (maxPrice !== undefined && r.price > maxPrice) return false;
    if (minMarketCap !== undefined && (r.marketCap ?? 0) < minMarketCap) return false;
    if (maxMarketCap !== undefined && (r.marketCap ?? Infinity) > maxMarketCap) return false;
    return true;
  });
}
