import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/market-context/yahoo.js", () => ({
  yahooClient: {
    summary: vi.fn().mockResolvedValue({
      calendarEvents: { earnings: { earningsDate: [new Date("2026-07-30")] } },
    }),
  },
}));

import { getEarningsDate } from "../../src/market-context/earnings.js";

describe("getEarningsDate", () => {
  it("returns next earnings date for symbol", async () => {
    const r = await getEarningsDate("AAPL");
    expect(r.nextEarningsDate?.toISOString().startsWith("2026-07-30")).toBe(true);
  });
});
