import { describe, it, expect } from "vitest";
import { resolveChannels, canSendNow, isUnderDailyCap } from "@/lib/proactive/schedule";
import { buildDedupeKey } from "@/lib/proactive/dedupe";
import type { NotificationPreferences } from "@/lib/proactive/types";

const base: NotificationPreferences = {
  quietHoursStart: 22,
  quietHoursEnd: 7,
  channelEmail: true,
  channelPush: false,
  channelWhatsapp: false,
  mutedKinds: [],
  whatsappNumber: null,
  maxPerDay: 6,
};

describe("resolveChannels", () => {
  it("always includes in_app plus enabled channels", () => {
    expect(resolveChannels("daily_insight", base)).toEqual(["in_app", "email"]);
  });

  it("drops whatsapp when there is no number even if the channel is on", () => {
    expect(resolveChannels("suggestion", { ...base, channelWhatsapp: true })).toEqual([
      "in_app",
      "email",
    ]);
    expect(
      resolveChannels("suggestion", { ...base, channelWhatsapp: true, whatsappNumber: "+972500000000" })
    ).toEqual(["in_app", "email", "whatsapp"]);
  });

  it("a muted kind gets no channels at all", () => {
    expect(resolveChannels("busy_week", { ...base, mutedKinds: ["busy_week"] })).toEqual([]);
  });
});

describe("canSendNow", () => {
  it("blocks outbound sends during quiet hours", () => {
    expect(canSendNow(2, base)).toBe(false);
    expect(canSendNow(10, base)).toBe(true);
  });
});

describe("isUnderDailyCap", () => {
  it("respects max_per_day", () => {
    expect(isUnderDailyCap(5, base)).toBe(true);
    expect(isUnderDailyCap(6, base)).toBe(false);
    expect(isUnderDailyCap(0, { ...base, maxPerDay: 0 })).toBe(false);
  });
});

describe("buildDedupeKey", () => {
  it("is stable for the same inputs and distinct across entities", () => {
    expect(buildDedupeKey("reminder_family", "person-1", "2026-08-31")).toBe(
      "reminder_family:person-1:2026-08-31"
    );
    expect(buildDedupeKey("daily_insight", "", "2026-08-31")).toBe("daily_insight:_:2026-08-31");
    expect(buildDedupeKey("reminder_family", "person-1", "2026-08-31")).not.toBe(
      buildDedupeKey("reminder_family", "person-2", "2026-08-31")
    );
  });
});
