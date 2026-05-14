// test/analytics/prob.test.ts
import { describe, it, expect } from "vitest";
import { probItm, expectedMove } from "../../src/analytics/prob.js";

describe("probItm", () => {
  it("ATM call ~50% probability over short horizon", () => {
    expect(probItm({ S: 100, K: 100, T: 30 / 365, r: 0.05, sigma: 0.2, right: "C" }))
      .toBeCloseTo(0.5, 1);
  });
  it("Deep ITM at T=0 returns 1; OTM returns 0", () => {
    expect(probItm({ S: 110, K: 100, T: 0, r: 0.05, sigma: 0.2, right: "C" })).toBe(1);
    expect(probItm({ S: 90, K: 100, T: 0, r: 0.05, sigma: 0.2, right: "C" })).toBe(0);
  });
});

describe("expectedMove", () => {
  it("scales with sqrt(time)", () => {
    const m = expectedMove({ S: 100, sigma: 0.2, days: 30 });
    expect(m.oneSdAbs).toBeCloseTo(100 * 0.2 * Math.sqrt(30 / 365), 4);
    expect(m.rangeLow).toBeLessThan(100);
    expect(m.rangeHigh).toBeGreaterThan(100);
  });
});
