import { bsGreeks, bsPrice, type Greeks } from "./bs.js";

export interface PmccLeg {
  strike: number;
  T: number;
  sigma: number;
  entryDebit?: number;
  entryCredit?: number;
  mark?: number;
}

export interface PmccInput {
  longLeg: PmccLeg;
  shortLeg: PmccLeg;
  S: number;
  r?: number;
  q?: number;
}

export interface PmccResult {
  netDebit: number;
  currentValue: number;
  pnlPerShare: number;
  breakevenAtLongExpiry: number;
  maxProfitIfShortCalledAway: number;
  combinedGreeks: Greeks;
  costBasisViolation: boolean;
  note: string;
}

export function pmccEvaluator(input: PmccInput): PmccResult {
  const r = input.r ?? 0.045;
  const q = input.q ?? 0;
  const { longLeg: L, shortLeg: S, S: spot } = input;
  const longMark =
    L.mark ?? bsPrice({ S: spot, K: L.strike, T: L.T, r, sigma: L.sigma, right: "C", q });
  const shortMark =
    S.mark ?? bsPrice({ S: spot, K: S.strike, T: S.T, r, sigma: S.sigma, right: "C", q });
  const longEntry = L.entryDebit ?? longMark;
  const shortEntry = S.entryCredit ?? shortMark;
  const netDebit = longEntry - shortEntry;
  const currentValue = longMark - shortMark;
  const pnlPerShare = currentValue - netDebit;
  const breakeven = L.strike + netDebit;

  const lg = bsGreeks({ S: spot, K: L.strike, T: L.T, r, sigma: L.sigma, right: "C", q });
  const sg = bsGreeks({ S: spot, K: S.strike, T: S.T, r, sigma: S.sigma, right: "C", q });
  const combined: Greeks = {
    delta: lg.delta - sg.delta,
    gamma: lg.gamma - sg.gamma,
    theta: lg.theta - sg.theta,
    vega: lg.vega - sg.vega,
    rho: lg.rho - sg.rho,
  };

  const costBasisViolation = S.strike <= L.strike + longEntry;
  const maxProfitIfShortCalledAway = S.strike - (L.strike + netDebit);

  return {
    netDebit,
    currentValue,
    pnlPerShare,
    breakevenAtLongExpiry: breakeven,
    maxProfitIfShortCalledAway,
    combinedGreeks: combined,
    costBasisViolation,
    note: "costBasisViolation=true means short strike <= LEAPS cost basis; assignment locks in a loss.",
  };
}
