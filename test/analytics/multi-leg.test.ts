// test/analytics/multi-leg.test.ts
import { describe, it, expect } from "vitest";
import { evaluateMultiLeg } from "../../src/analytics/multi-leg.js";

describe("evaluateMultiLeg", () => {
  it("bull put credit spread (short 95P / long 90P), net credit 1.20", () => {
    const result = evaluateMultiLeg({
      legs: [
        { qty: -1, strike: 95, right: "P", premium: 2.50, T: 30 / 365, sigma: 0.25 },
        { qty: +1, strike: 90, right: "P", premium: 1.30, T: 30 / 365, sigma: 0.25 },
      ],
      S: 100,
    });
    expect(result.netCreditDebit).toBeCloseTo(1.20, 4);   // credit > 0
    expect(result.maxProfit).toBeCloseTo(1.20, 4);        // credit if both expire OTM
    expect(result.maxLoss).toBeCloseTo(-3.80, 4);         // -(5 wide - 1.20)
    expect(result.breakevens.some((b) => Math.abs(b - 93.80) < 0.05)).toBe(true);
  });
  it("iron condor has 2 breakevens and finite max profit/loss", () => {
    const result = evaluateMultiLeg({
      legs: [
        { qty: -1, strike: 110, right: "C", premium: 1.00, T: 45 / 365, sigma: 0.20 },
        { qty: +1, strike: 115, right: "C", premium: 0.40, T: 45 / 365, sigma: 0.20 },
        { qty: -1, strike: 90,  right: "P", premium: 1.00, T: 45 / 365, sigma: 0.20 },
        { qty: +1, strike: 85,  right: "P", premium: 0.40, T: 45 / 365, sigma: 0.20 },
      ],
      S: 100,
    });
    expect(result.breakevens).toHaveLength(2);
    expect(result.maxProfit).toBeCloseTo(1.20, 4);
    expect(result.maxLoss).toBeCloseTo(-3.80, 4);
  });
});
