import { bsGreeks, bsPrice, type Greeks, type Right } from "./bs.js";

export interface Contract {
  strike: number;
  T: number;
  sigma: number;
  mark?: number;
  right: Right;
}

export interface RollInput {
  current: Contract & { mark: number };
  candidates: Contract[];
  S: number;
  r?: number;
  q?: number;
}

export interface RollCandidateResult {
  candidate: Contract;
  candidateMark: number;
  netDebitOfRoll: number;
  newDelta: number;
  newTheta: number;
  newVega: number;
  score: number;
}

export function rollAnalyzer(input: RollInput): RollCandidateResult[] {
  const r = input.r ?? 0.045;
  const q = input.q ?? 0;
  const out: RollCandidateResult[] = input.candidates.map((c) => {
    const mark =
      c.mark ?? bsPrice({ S: input.S, K: c.strike, T: c.T, r, sigma: c.sigma, right: c.right, q });
    const g: Greeks = bsGreeks({
      S: input.S,
      K: c.strike,
      T: c.T,
      r,
      sigma: c.sigma,
      right: c.right,
      q,
    });
    const netDebit = mark - input.current.mark;
    const score = -netDebit + 2 * g.delta;
    return {
      candidate: c,
      candidateMark: mark,
      netDebitOfRoll: netDebit,
      newDelta: g.delta,
      newTheta: g.theta,
      newVega: g.vega,
      score,
    };
  });
  out.sort((a, b) => b.score - a.score);
  return out;
}
