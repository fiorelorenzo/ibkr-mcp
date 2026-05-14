export type Right = "C" | "P";

export interface BsInput {
  S: number;
  K: number;
  T: number;
  r: number;
  sigma: number;
  right: Right;
  q?: number;
}

// Abramowitz-Stegun 26.2.17 — accurate to ~7.5e-8
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function bsD1D2(input: BsInput): { d1: number; d2: number } {
  const { S, K, T, r, sigma } = input;
  const q = input.q ?? 0;
  if (T <= 0 || sigma <= 0) throw new Error("T and sigma must be positive");
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return { d1, d2 };
}

export function bsPrice(input: BsInput): number {
  const { S, K, T, r, right } = input;
  const q = input.q ?? 0;
  if (T <= 0) {
    return right === "C" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  const { d1, d2 } = bsD1D2(input);
  if (right === "C") {
    return S * Math.exp(-q * T) * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  }
  return K * Math.exp(-r * T) * normCdf(-d2) - S * Math.exp(-q * T) * normCdf(-d1);
}
