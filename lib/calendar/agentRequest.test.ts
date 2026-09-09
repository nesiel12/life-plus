import { describe, expect, it } from "vitest";
import {
  calendarAgentRequestSchema,
  deterministicProposal,
  keepBusy,
  resolveNowLocal,
  toChronotype,
} from "@/lib/calendar/agentRequest";

describe("calendarAgentRequestSchema", () => {
  it("accepts a well-formed body", () => {
    const r = calendarAgentRequestSchema.parse({
      message: "פגישה מחר ב-14:30",
      nowLocal: "2026-09-15T10:00",
      timeZone: "Asia/Jerusalem",
      busy: [{ start: "2026-09-15T09:00:00Z", end: "2026-09-15T10:00:00Z", title: "x" }],
      chronotype: { wakeTime: "07:00", peakFocusHours: ["morning"] },
    });
    expect(r.message).toBe("פגישה מחר ב-14:30");
    expect(r.timeZone).toBe("Asia/Jerusalem");
  });

  // The actual regression: an older DB row hands the client `chronotype: null`,
  // which failed `z.object()` and 400'd the whole request.
  it("survives a null chronotype", () => {
    const r = calendarAgentRequestSchema.parse({ message: "פגישה מחר ב-14:30", chronotype: null });
    expect(r.chronotype).toEqual({});
  });

  it("survives a chronotype with junk field types", () => {
    const r = calendarAgentRequestSchema.parse({
      message: "x",
      chronotype: { wakeTime: 700, peakFocusHours: "morning", extra: true },
    });
    expect(r.chronotype.wakeTime).toBeUndefined();
    expect(r.chronotype.peakFocusHours).toBeUndefined();
  });

  it("never rejects on nowLocal — a wrong shape is filtered downstream by resolveNowLocal", () => {
    expect(calendarAgentRequestSchema.safeParse({ message: "x", nowLocal: "not a date" }).success).toBe(true);
    expect(calendarAgentRequestSchema.safeParse({ message: "x", nowLocal: 12345 }).success).toBe(true);
    expect(resolveNowLocal("not a date", "Asia/Jerusalem")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("defaults a missing timezone and busy list", () => {
    const r = calendarAgentRequestSchema.parse({ message: "x" });
    expect(r.timeZone).toBe("Asia/Jerusalem");
    expect(r.busy).toEqual([]);
  });

  it("keeps good busy entries and nulls out broken ones", () => {
    const r = calendarAgentRequestSchema.parse({
      message: "x",
      busy: [
        { start: "2026-09-15T09:00:00Z", end: "2026-09-15T10:00:00Z" },
        { start: 123, end: null }, // broken -> caught to {}
        { end: "2026-09-15T12:00:00Z" }, // missing start
      ],
    });
    expect(r.busy).toHaveLength(3);
    expect(keepBusy(r.busy)).toHaveLength(1);
  });

  it("still rejects an empty message — the one thing that must be present", () => {
    expect(calendarAgentRequestSchema.safeParse({ message: "   " }).success).toBe(false);
    expect(calendarAgentRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("resolveNowLocal", () => {
  it("passes a valid client wall clock straight through", () => {
    expect(resolveNowLocal("2026-09-15T10:00", "Asia/Jerusalem")).toBe("2026-09-15T10:00");
  });

  it("falls back to the server clock in the user's zone for junk input", () => {
    const out = resolveNowLocal("", "Asia/Jerusalem");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe("toChronotype", () => {
  it("keeps only real day parts", () => {
    const c = toChronotype({
      wakeTime: "07:00",
      sleepTime: undefined,
      peakFocusHours: ["morning", "banana"],
      lowEnergyHours: undefined,
    });
    expect(c.peakFocusHours).toEqual(["morning"]);
    expect(c.wakeTime).toBe("07:00");
  });
});

describe("deterministicProposal", () => {
  // 2026-09-15 is a Tuesday.
  const anchor = new Date("2026-09-15T10:00:00+03:00");

  it("resolves the exact failing example to tomorrow at 14:30 local", () => {
    const p = deterministicProposal("פגישה מחר ב-14:30", "Asia/Jerusalem", [], anchor);
    expect(p).not.toBeNull();
    expect(p!.event.startLocal).toBe("2026-09-16T14:30");
    expect(p!.event.timeZone).toBe("Asia/Jerusalem");
    // 14:30 Israel summer time == 11:30 UTC.
    expect(p!.event.start).toBe("2026-09-16T11:30:00.000Z");
    expect(p!.degraded).toBe(true);
  });

  it("handles 'היום' and an 8am wall time", () => {
    const p = deterministicProposal("שיעור היום ב-8 בבוקר", "Asia/Jerusalem", [], anchor);
    expect(p!.event.startLocal).toBe("2026-09-15T08:00");
  });

  it("handles a named weekday", () => {
    const p = deterministicProposal("אימון ביום ראשון ב-19:00", "Asia/Jerusalem", [], anchor);
    // Next Sunday after Tue 2026-09-15 is 2026-09-20.
    expect(p!.event.startLocal).toBe("2026-09-20T19:00");
  });

  it("returns null when there is no explicit time", () => {
    expect(deterministicProposal("פגישה מחר", "Asia/Jerusalem", [], anchor)).toBeNull();
  });

  it("flags a conflict against a busy interval", () => {
    const busy = [{ start: "2026-09-16T11:00:00.000Z", end: "2026-09-16T12:00:00.000Z" }];
    const p = deterministicProposal("פגישה מחר ב-14:30", "Asia/Jerusalem", busy, anchor);
    expect(p!.conflict).toBe(true);
  });
});
