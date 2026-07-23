import { describe, expect, it } from "vitest";
import { suggestMeetupLocationType } from "@/lib/family/suggestMeetupLocationType";

describe("suggestMeetupLocationType", () => {
  it("suggests a breakfast spot in the morning", () => {
    expect(suggestMeetupLocationType(8)).toBe("בית קפה לארוחת בוקר");
  });

  it("suggests a restaurant in the evening", () => {
    expect(suggestMeetupLocationType(18)).toBe("מסעדה");
  });

  it("suggests a quiet spot at night", () => {
    expect(suggestMeetupLocationType(23)).toBe("מקום שקט לשיחה");
  });
});
