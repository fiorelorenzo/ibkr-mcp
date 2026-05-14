import type { BrokerClient } from "./connection.js";
import type { HistoricalBar } from "./types.js";

export interface HistoricalBarsQuery {
  /** IB duration string e.g. "30 D", "1 Y", "6 M". */
  duration: string;
  /** IB bar size e.g. "1 day", "1 hour", "5 mins". */
  barSize: string;
  /** "TRADES" | "MIDPOINT" | "BID" | "ASK" | … (default TRADES). */
  whatToShow?: string;
  /** Regular trading hours only. Default true. */
  useRTH?: boolean;
  /** End date/time. Default "" (now). */
  endDateTime?: string;
}

export async function getHistoricalBars(
  client: BrokerClient,
  symbol: string,
  query: HistoricalBarsQuery,
): Promise<HistoricalBar[]> {
  const contract = {
    symbol,
    secType: "STK",
    exchange: "SMART",
    currency: "USD",
  };
  const rawBars = (await client.reqHistoricalData(contract, query)) as HistoricalBar[];
  return rawBars.map((b) => ({
    time: String(b.time),
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: Number(b.volume ?? 0),
  }));
}
