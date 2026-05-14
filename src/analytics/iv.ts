import { bsPrice, type Right } from "./bs.js";

export interface IvInput {
  price: number;
  S: number;
  K: number;
  T: number;
  r: number;
  right: Right;
  q?: number;
}

export function impliedVolatility(input: IvInput): number {
  const { price, S, K, T, r, right } = input;
  const q = input.q ?? 0;
  const intrinsic = right === "C" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  if (price < intrinsic - 1e-6) throw new Error("price below intrinsic");
  if (T <= 0) return 0;
  const f = (sigma: number): number =>
    bsPrice({ S, K, T, r, sigma, right, q }) - price;
  return brent(f, 1e-6, 5.0, 1e-6, 200);
}

// Brent's method (Numerical Recipes 9.3) — root finding on [a,b] with f(a)*f(b)<0.
function brent(
  f: (x: number) => number,
  aIn: number,
  bIn: number,
  tol: number,
  maxIter: number,
): number {
  let a = aIn;
  let b = bIn;
  let fa = f(a);
  let fb = f(b);
  if (fa * fb > 0) return NaN;
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qa = fa / fc;
        const rr = fb / fc;
        p = s * (2 * xm * qa * (qa - rr) - (b - a) * (rr - 1));
        q = (qa - 1) * (rr - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : Math.sign(xm) * tol1;
    fb = f(b);
  }
  return b;
}
