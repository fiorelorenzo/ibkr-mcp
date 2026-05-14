// test/analytics/greeks.test.ts
import { describe, it, expect } from "vitest";
import { bsGreeks } from "../../src/analytics/bs.js";

describe("bsGreeks", () => {
  it("ATM call has delta ~0.5", () => {
    const g = bsGreeks({ S: 100, K: 100, T: 30 / 365, r: 0.05, sigma: 0.2, right: "C" });
    expect(g.delta).toBeCloseTo(0.52, 1);
    expect(g.gamma).toBeGreaterThan(0);
    expect(g.theta).toBeLessThan(0);
    expect(g.vega).toBeGreaterThan(0);
  });
  it("Deep ITM call has delta near 1", () => {
    const g = bsGreeks({ S: 150, K: 100, T: 1, r: 0.05, sigma: 0.2, right: "C" });
    expect(g.delta).toBeGreaterThan(0.95);
  });
  it("Put delta is negative", () => {
    const g = bsGreeks({ S: 100, K: 100, T: 30 / 365, r: 0.05, sigma: 0.2, right: "P" });
    expect(g.delta).toBeLessThan(0);
  });
  it("Returns zeros when T<=0", () => {
    const g = bsGreeks({ S: 100, K: 100, T: 0, r: 0.05, sigma: 0.2, right: "C" });
    expect(g).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 });
  });
});
