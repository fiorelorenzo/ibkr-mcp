import { yahooClient } from "./yahoo.js";

export interface DividendInfo {
  symbol: string;
  exDate: Date | null;
  amount: number | null;
  yieldPct: number | null;
}

export async function getDividendCalendar(symbol: string): Promise<DividendInfo> {
  const s = (await yahooClient.summary(symbol, ["summaryDetail", "calendarEvents"])) as {
    summaryDetail?: { dividendRate?: number; dividendYield?: number; exDividendDate?: Date };
    calendarEvents?: { exDividendDate?: Date };
  };
  return {
    symbol,
    exDate: s.calendarEvents?.exDividendDate ?? s.summaryDetail?.exDividendDate ?? null,
    amount: s.summaryDetail?.dividendRate ?? null,
    yieldPct: s.summaryDetail?.dividendYield ?? null,
  };
}

export async function getDividendExDatesNextNDays(
  symbols: string[],
  days: number,
): Promise<DividendInfo[]> {
  const horizon = new Date(Date.now() + days * 86_400_000);
  const all = await Promise.all(symbols.map(getDividendCalendar));
  return all.filter((d) => d.exDate && d.exDate <= horizon);
}
