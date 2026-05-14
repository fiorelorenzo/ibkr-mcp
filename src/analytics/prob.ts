import { bsD1D2, normCdf, type Right } from "./bs.js";

export interface ProbItmInput {
  S: number;
  K: number;
  T: number;
  r: number;
  sigma: number;
  right: Right;
  q?: number;
}

export function probItm(input: ProbItmInput): number {
  const { S, K, T, sigma, right } = input;
  if (T <= 0 || sigma <= 0) {
    const hit = right === "C" ? S > K : S < K;
    return hit ? 1 : 0;
  }
  const { d2 } = bsD1D2(input);
  return right === "C" ? normCdf(d2) : normCdf(-d2);
}

export interface ExpectedMoveInput {
  S: number;
  sigma: number;
  days: number;
}

export interface ExpectedMoveResult {
  oneSdAbs: number;
  oneSdPct: number;
  rangeLow: number;
  rangeHigh: number;
}

export function expectedMove(input: ExpectedMoveInput): ExpectedMoveResult {
  const T = Math.max(input.days, 0) / 365;
  const sd = input.S * input.sigma * Math.sqrt(T);
  return {
    oneSdAbs: sd,
    oneSdPct: input.S ? sd / input.S : 0,
    rangeLow: input.S - sd,
    rangeHigh: input.S + sd,
  };
}
