import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

export const yahooClient = {
  quote: (symbol: string) => yf.quote(symbol),
  summary: (symbol: string, modules: string[]) =>
    yf.quoteSummary(symbol, { modules: modules as never }),
  historical: (
    symbol: string,
    query: { period1: Date; period2?: Date; interval?: "1d" | "1wk" | "1mo" },
  ) => yf.historical(symbol, query),
  search: (query: string) => yf.search(query),
};
