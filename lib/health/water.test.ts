import { describe, expect, it } from "vitest";
import { WATER_STEP_ML, litersLabel, waterFraction, waterPace, waterTotal } from "@/lib/health/water";

const day = new Date(2026, 8, 18, 0, 0);
const log = (id: string, ml: number, hour: number) => ({ id, amountMl: ml, loggedAt: new Date(2026, 8, 18, hour).toISOString() });

describe("water", () => {
  it("steps by a standard glass", () => {
    expect(WATER_STEP_ML).toBe(250);
  });

  it("totals only today's logs", () => {
    const yesterday = { id: "y", amountMl: 900, loggedAt: new Date(2026, 8, 17, 22).toISOString() };
    expect(waterTotal([log("a", 250, 8), log("b", 500, 12), yesterday], day)).toBe(750);
  });

  it("fills the glass proportionally and never overflows", () => {
    expect(waterFraction(1250, 2500)).toBe(0.5);
    expect(waterFraction(4000, 2500)).toBe(1);
    expect(waterFraction(100, 0)).toBe(0);
  });

  it("labels liters in Hebrew", () => {
    expect(litersLabel(1250)).toBe("1.25 ל׳");
    expect(litersLabel(2000)).toBe("2 ל׳");
    expect(litersLabel(1500)).toBe("1.5 ל׳");
  });

  it("paces drinking across waking hours", () => {
    const noon = new Date(2026, 8, 18, 12, 0);
    // 07:00→21:00 is 14h; 5h in → ~36% of 2500 ≈ 900.
    expect(waterPace(900, 2500, noon).pace).toBe("on-track");
    expect(waterPace(200, 2500, noon).pace).toBe("behind");
    expect(waterPace(1600, 2500, noon).pace).toBe("ahead");
    expect(waterPace(2500, 2500, noon).pace).toBe("done");
    expect(waterPace(0, 2500, new Date(2026, 8, 18, 6, 0)).expectedMl).toBe(0);
  });
});
