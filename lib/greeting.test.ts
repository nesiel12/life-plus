import { describe, expect, it } from "vitest";
import { timeOfDayFromHour, greetingForHour } from "@/lib/greeting";

describe("timeOfDayFromHour", () => {
  it("classifies morning, afternoon, evening, and night correctly", () => {
    expect(timeOfDayFromHour(7)).toBe("morning");
    expect(timeOfDayFromHour(14)).toBe("afternoon");
    expect(timeOfDayFromHour(18)).toBe("evening");
    expect(timeOfDayFromHour(23)).toBe("night");
    expect(timeOfDayFromHour(2)).toBe("night");
  });

  it("treats the boundary hours consistently (start-inclusive)", () => {
    expect(timeOfDayFromHour(5)).toBe("morning");
    expect(timeOfDayFromHour(12)).toBe("afternoon");
    expect(timeOfDayFromHour(17)).toBe("evening");
    expect(timeOfDayFromHour(21)).toBe("night");
  });
});

describe("greetingForHour", () => {
  it("returns a real Hebrew greeting for each time of day", () => {
    expect(greetingForHour(8)).toBe("בוקר טוב");
    expect(greetingForHour(13)).toBe("צהריים טובים");
    expect(greetingForHour(19)).toBe("ערב טוב");
    expect(greetingForHour(1)).toBe("לילה טוב");
  });
});
