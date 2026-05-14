import { yahooClient } from "./yahoo.js";

export async function getEarningsDate(symbol: string): Promise<{
  symbol: string;
  nextEarningsDate: Date | null;
}> {
  const s = (await yahooClient.summary(symbol, ["calendarEvents"])) as {
    calendarEvents?: { earnings?: { earningsDate?: Date[] } };
  };
  const dates = s.calendarEvents?.earnings?.earningsDate ?? [];
  return { symbol, nextEarningsDate: dates[0] ?? null };
}
