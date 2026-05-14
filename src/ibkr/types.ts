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
