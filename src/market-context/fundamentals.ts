import { yahooClient } from "./yahoo.js";

export async function getFundamentals(symbol: string) {
  return yahooClient.summary(symbol, ["summaryDetail", "assetProfile", "price"]);
}

export async function get52wContext(symbol: string): Promise<{
  symbol: string;
  high52w: number | null;
  low52w: number | null;
  currentPrice: number | null;
  pctFromHigh: number | null;
  pctFromLow: number | null;
}> {
  const s = (await yahooClient.summary(symbol, ["summaryDetail", "price"])) as {
    summaryDetail?: { fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number };
    price?: { regularMarketPrice?: number };
  };
  const high = s.summaryDetail?.fiftyTwoWeekHigh ?? null;
  const low = s.summaryDetail?.fiftyTwoWeekLow ?? null;
  const current = s.price?.regularMarketPrice ?? null;
  return {
    symbol,
    high52w: high,
    low52w: low,
    currentPrice: current,
    pctFromHigh: high && current ? (current - high) / high : null,
    pctFromLow: low && current ? (current - low) / low : null,
  };
}
