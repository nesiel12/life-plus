import { describe, expect, it } from "vitest";
import { buildRRule, describeRecurrence } from "@/lib/calendar/recurrence";

describe("buildRRule", () => {
  it("weekly Sun–Thu (every evening except Fri/Sat)", () => {
    expect(buildRRule({ freq: "weekly", byWeekday: [0, 1, 2, 3, 4] })).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH"
    );
  });

  it("daily collapses when every weekday is listed", () => {
    expect(buildRRule({ freq: "weekly", byWeekday: [0, 1, 2, 3, 4, 5, 6] })).toBe("RRULE:FREQ=DAILY");
    expect(buildRRule({ freq: "daily" })).toBe("RRULE:FREQ=DAILY");
  });

  it("adds COUNT and UNTIL", () => {
    expect(buildRRule({ freq: "daily", count: 10 })).toBe("RRULE:FREQ=DAILY;COUNT=10");
    expect(buildRRule({ freq: "weekly", byWeekday: [1], until: "2026-12-31" })).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235900Z"
    );
  });
});

describe("describeRecurrence", () => {
  it("names the common shapes in Hebrew", () => {
    expect(describeRecurrence({ freq: "weekly", byWeekday: [0, 1, 2, 3, 4] })).toBe("כל יום א׳–ה׳");
    expect(describeRecurrence({ freq: "daily" })).toBe("כל יום");
    expect(describeRecurrence({ freq: "weekly", byWeekday: [2] })).toBe("כל יום שלישי");
    expect(describeRecurrence({ freq: "weekly", byWeekday: [0, 2], count: 4 })).toBe(
      "כל ראשון, שלישי · 4 פעמים"
    );
  });
});
