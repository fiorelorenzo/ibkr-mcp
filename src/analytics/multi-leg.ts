import { bsGreeks, type Greeks, type Right } from "./bs.js";

export interface Leg {
  qty: number;          // signed: + long, - short
  strike: number;
  right: Right;
  premium: number;      // entry premium per share (always positive)
  T: number;
  sigma: number;
}

export interface MultiLegInput {
  legs: Leg[];
  S: number;
  r?: number;
  q?: number;
}

export interface MultiLegResult {
  netCreditDebit: number;       // positive = credit, negative = debit
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
  netGreeks: Greeks;
  pnlAtExpiry: (price: number) => number;
}

function payoffAtExpiry(legs: Leg[], price: number): number {
  let total = 0;
  for (const l of legs) {
    const intrinsic = l.right === "C" ? Math.max(price - l.strike, 0) : Math.max(l.strike - price, 0);
    total += l.qty * intrinsic - l.qty * l.premium;
    // l.qty negative for short: receive premium, pay intrinsic at expiry
  }
  return total;
}

export function evaluateMultiLeg(input: MultiLegInput): MultiLegResult {
  const r = input.r ?? 0.045;
  const q = input.q ?? 0;

  const netCreditDebit = input.legs.reduce((acc, l) => acc - l.qty * l.premium, 0);

  // Sample payoff on a grid from 0.5*S to 1.5*S to find breakevens and extrema.
  const lo = 0.5 * input.S;
  const hi = 1.5 * input.S;
  const steps = 5000;
  const dx = (hi - lo) / steps;
  let maxProfit = -Infinity;
  let maxLoss = Infinity;
  const breakevens: number[] = [];
  let prev = payoffAtExpiry(input.legs, lo);
  for (let i = 1; i <= steps; i++) {
    const x = lo + i * dx;
    const y = payoffAtExpiry(input.legs, x);
    if (y > maxProfit) maxProfit = y;
    if (y < maxLoss) maxLoss = y;
    if (prev === 0 || (prev < 0 && y > 0) || (prev > 0 && y < 0)) {
      // linear interp between (x-dx, prev) and (x, y)
      const xb = x - dx - (prev * dx) / (y - prev);
      breakevens.push(Number(xb.toFixed(2)));
    }
    prev = y;
  }

  const netGreeks: Greeks = input.legs.reduce<Greeks>(
    (acc, l) => {
      const g = bsGreeks({ S: input.S, K: l.strike, T: l.T, r, sigma: l.sigma, right: l.right, q });
      return {
        delta: acc.delta + l.qty * g.delta,
        gamma: acc.gamma + l.qty * g.gamma,
        theta: acc.theta + l.qty * g.theta,
        vega: acc.vega + l.qty * g.vega,
        rho: acc.rho + l.qty * g.rho,
      };
    },
    { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
  );

  return {
    netCreditDebit,
    maxProfit: Math.abs(maxProfit) > 1e9 ? Infinity : maxProfit,
    maxLoss: Math.abs(maxLoss) > 1e9 ? -Infinity : maxLoss,
    breakevens,
    netGreeks,
    pnlAtExpiry: (price: number) => payoffAtExpiry(input.legs, price),
  };
}
