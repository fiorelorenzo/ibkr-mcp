export interface AccountSummary {
  accountId: string;
  netLiq: number;
  buyingPower: number;
  excessLiquidity: number;
  initMargin: number;
  maintMargin: number;
}

export interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

export interface OptionPosition {
  symbol: string;
  secType: "OPT";
  right: "C" | "P";
  strike: number;
  expiry: string;
  quantity: number;
  avgCost: number;
  marketPrice: number;
  unrealizedPnl: number;
  greeks?: OptionGreeks;
}

export interface StockPosition {
  symbol: string;
  secType: "STK";
  quantity: number;
  avgCost: number;
  marketPrice: number;
  unrealizedPnl: number;
}

export type Position = StockPosition | OptionPosition;

export interface MarketDataSnapshot {
  bid?: number;
  ask?: number;
  last?: number;
  close?: number;
  volume?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;
  undPrice?: number;
  /**
   * Where the bid/ask/last came from.
   * - `"ibkr"`: live broker feed.
   * - `"yahoo-delayed"`: post-market / no-subscription fallback for stocks and indices.
   * - `"unavailable"`: no data from either source (e.g. illiquid name without Yahoo quote, or option with no broker subscription).
   */
  source?: "ibkr" | "yahoo-delayed" | "unavailable";
  /** True when the snapshot is from a delayed source (e.g. Yahoo when IBKR is closed). */
  delayed?: boolean;
  /** When `source === "yahoo-delayed"`: the symbol Yahoo actually quoted (may differ from the requested symbol for indices and proxies). */
  resolvedSymbol?: string;
  /** Method used by the Yahoo resolution cascade when `source === "yahoo-delayed"`. */
  resolutionMethod?:
    | "caller-hint"
    | "direct"
    | "caret-prefix"
    | "search-best-match"
    | "web-search-duckduckgo"
    | "web-search-wikipedia";
  /** Human-readable name from Yahoo, when available. */
  longName?: string;
  /** True when no proxy was used (resolved symbol equals requested symbol). */
  isExactSymbol?: boolean;
  /** When `source === "unavailable"`, the underlying broker error message (if any). */
  error?: string;
}

export interface HistoricalBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionChainStrike {
  strike: number;
  bid?: number;
  ask?: number;
  last?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;
}

export interface OptionChain {
  symbol: string;
  expiry: string;
  strikes: number[];
  calls: OptionChainStrike[];
  puts: OptionChainStrike[];
}
