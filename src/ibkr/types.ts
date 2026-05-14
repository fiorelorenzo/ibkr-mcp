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
  /** Where the bid/ask/last came from. `"ibkr"` is the default broker feed; `"yahoo-delayed"` is the post-market fallback for stocks. */
  source?: "ibkr" | "yahoo-delayed";
  /** True when the snapshot is from a delayed source (e.g. Yahoo when IBKR is closed). */
  delayed?: boolean;
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
