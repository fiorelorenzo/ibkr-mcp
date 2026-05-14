// test/analytics/roll.test.ts
import { describe, it, expect } from "vitest";
import { rollAnalyzer } from "../../src/analytics/roll.js";

describe("rollAnalyzer", () => {
  it("ranks candidates by composite score (cheaper + higher delta wins)", () => {
    const result = rollAnalyzer({
      current: { strike: 120, T: 7 / 365, sigma: 0.30, mark: 0.5, right: "C" },
      candidates: [
        { strike: 125, T: 35 / 365, sigma: 0.30, mark: 1.0, right: "C" },
        { strike: 130, T: 35 / 365, sigma: 0.30, mark: 0.4, right: "C" },
      ],
      S: 122,
    });
    expect(result).toHaveLength(2);
    expect(result[0].score).toBeGreaterThan(result[1].score);
    expect(result[0].netDebitOfRoll).toBeDefined();
  });
});
