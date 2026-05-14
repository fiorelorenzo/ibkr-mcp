// test/analytics/iv.test.ts
import { describe, it, expect } from "vitest";
import { impliedVolatility } from "../../src/analytics/iv.js";
import { bsPrice } from "../../src/analytics/bs.js";

describe("impliedVolatility", () => {
  it("round-trips: price → IV → price", () => {
    const trueSigma = 0.27;
    const params = { S: 100, K: 105, T: 60 / 365, r: 0.05, sigma: trueSigma, right: "C" as const };
    const price = bsPrice(params);
    const iv = impliedVolatility({ price, ...params });
    expect(iv).toBeCloseTo(trueSigma, 4);
  });
  it("throws on price below intrinsic", () => {
    expect(() =>
      impliedVolatility({ price: 1, S: 120, K: 100, T: 0.5, r: 0.05, right: "C" }),
    ).toThrow(/intrinsic/);
  });
  it("returns 0 when T<=0", () => {
    expect(impliedVolatility({ price: 10, S: 110, K: 100, T: 0, r: 0.05, right: "C" })).toBe(0);
  });
});
