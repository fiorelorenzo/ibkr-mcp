import { z } from "zod";
import { getEarningsDate } from "../market-context/earnings.js";
import {
  getDividendCalendar,
  getDividendExDatesNextNDays,
} from "../market-context/dividends.js";
import { getFundamentals, get52wContext } from "../market-context/fundamentals.js";
import { screenUniverse } from "../market-context/screen.js";
import { toMcpInputSchema, type ToolDef } from "./zod-helpers.js";

const SymbolInput = z.object({ symbol: z.string() });

const DividendExNextNDaysInput = z.object({
  symbols: z.array(z.string()),
  days: z.number().int().positive(),
});

const UniverseEnum = z.enum(["sp500", "ndx100", "dow30", "russell1000"]);

const ScreenInput = z.object({
  universe: UniverseEnum.optional(),
  watchlist: z.array(z.string()).optional(),
  filters: z.object({
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    minMarketCap: z.number().optional(),
    maxMarketCap: z.number().optional(),
  }),
});

export const MARKET_CONTEXT_TOOL_DEFS: ToolDef[] = [
  {
    name: "get_earnings_date",
    description: "Next earnings date for a symbol (Yahoo Finance calendarEvents).",
    inputSchema: toMcpInputSchema(SymbolInput),
    handler: async (raw) => {
      const { symbol } = SymbolInput.parse(raw);
      return getEarningsDate(symbol);
    },
  },
  {
    name: "get_dividend_calendar",
    description: "Dividend info for a single symbol (ex-date, amount, yield).",
    inputSchema: toMcpInputSchema(SymbolInput),
    handler: async (raw) => {
      const { symbol } = SymbolInput.parse(raw);
      return getDividendCalendar(symbol);
    },
  },
  {
    name: "get_dividend_ex_dates_next_n_days",
    description: "Filter a list of symbols by upcoming ex-dividend date within N days.",
    inputSchema: toMcpInputSchema(DividendExNextNDaysInput),
    handler: async (raw) => {
      const { symbols, days } = DividendExNextNDaysInput.parse(raw);
      return getDividendExDatesNextNDays(symbols, days);
    },
  },
  {
    name: "get_fundamentals",
    description: "Yahoo summary (summaryDetail + assetProfile + price) for a symbol.",
    inputSchema: toMcpInputSchema(SymbolInput),
    handler: async (raw) => {
      const { symbol } = SymbolInput.parse(raw);
      return getFundamentals(symbol);
    },
  },
  {
    name: "get_52w_context",
    description: "52-week high/low + current price and percent distance from each.",
    inputSchema: toMcpInputSchema(SymbolInput),
    handler: async (raw) => {
      const { symbol } = SymbolInput.parse(raw);
      return get52wContext(symbol);
    },
  },
  {
    name: "screen_universe",
    description:
      "Screen tickers (universe or custom watchlist) by price and market cap filters.",
    inputSchema: toMcpInputSchema(ScreenInput),
    handler: async (raw) => {
      const input = ScreenInput.parse(raw);
      return screenUniverse(input);
    },
  },
];
