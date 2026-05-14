// test/analytics/bs.test.ts
import { describe, it, expect } from "vitest";
import { bsPrice } from "../../src/analytics/bs.js";

describe("bsPrice", () => {
  it("prices an ATM 30-day call (Hull textbook reference)", () => {
    // S=100, K=100, T=30/365, r=0.05, sigma=0.20, q=0 → ~2.49
    expect(bsPrice({ S: 100, K: 100, T: 30 / 365, r: 0.05, sigma: 0.2, right: "C" }))
      .toBeCloseTo(2.49, 1);
  });
  it("prices an OTM put with dividend yield", () => {
    expect(bsPrice({ S: 100, K: 95, T: 0.5, r: 0.04, sigma: 0.25, right: "P", q: 0.02 }))
      .toBeCloseTo(4.22, 1);
  });
  it("returns intrinsic value when T<=0", () => {
    expect(bsPrice({ S: 110, K: 100, T: 0, r: 0.05, sigma: 0.2, right: "C" })).toBe(10);
    expect(bsPrice({ S: 90, K: 100, T: 0, r: 0.05, sigma: 0.2, right: "P" })).toBe(10);
    expect(bsPrice({ S: 100, K: 100, T: 0, r: 0.05, sigma: 0.2, right: "C" })).toBe(0);
  });
});
