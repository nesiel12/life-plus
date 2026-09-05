import { describe, expect, it } from "vitest";
import { blocksFrom, parseIntention, tasksFrom } from "@/lib/intentions/parseIntention";

// 2026-09-15 10:00, a Tuesday — matches parseHebrewEvent.test.ts.
const NOW = new Date(2026, 8, 15, 10, 0, 0, 0);

describe("parseIntention", () => {
  it("splits a real multi-part intention into tasks and a timed block", () => {
    const parsed = parseIntention(
      "היום אני רוצה לסיים את הדוח, לקבוע פגישה עם דנה ב-14:00, ולהתקשר לאמא",
      NOW
    );
    const tasks = tasksFrom(parsed);
    const blocks = blocksFrom(parsed);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].title).toContain("דנה");
    expect(blocks[0].start).toBe("2026-09-15T14:00");

    expect(tasks.map((t) => t.title)).toEqual(
      expect.arrayContaining([expect.stringContaining("הדוח"), expect.stringContaining("לאמא")])
    );
  });

  describe("task vs block", () => {
    it("makes an item with an explicit time a scheduled block", () => {
      const parsed = parseIntention("פגישה ב-14:00", NOW);
      expect(blocksFrom(parsed)).toHaveLength(1);
      expect(tasksFrom(parsed)).toHaveLength(0);
    });

    // The core safety property: no invented hours.
    it("makes an item with no time an undated task, never a guessed block", () => {
      const parsed = parseIntention("לסיים את הדוח", NOW);
      expect(tasksFrom(parsed)).toHaveLength(1);
      expect(blocksFrom(parsed)).toHaveLength(0);
    });

    it("carries the real duration default onto a block", () => {
      const [block] = blocksFrom(parseIntention("פגישה ב-14:00", NOW));
      expect(block.durationMinutes).toBe(60);
    });

    it("resolves a relative date on a block", () => {
      const [block] = blocksFrom(parseIntention("מחר פגישה ב-9:00", NOW));
      expect(block.start).toBe("2026-09-16T09:00");
    });
  });

  describe("splitting", () => {
    it("splits on commas", () => {
      expect(parseIntention("לכתוב מייל, לקנות חלב", NOW).items).toHaveLength(2);
    });

    it("splits on newlines and bullets", () => {
      expect(parseIntention("• לכתוב מייל\n• לקנות חלב", NOW).items).toHaveLength(2);
    });

    it("splits on semicolons", () => {
      expect(parseIntention("לכתוב מייל; לקנות חלב", NOW).items).toHaveLength(2);
    });

    it("splits on ו only when it opens an infinitive", () => {
      const parsed = parseIntention("לכתוב מייל ולקנות חלב", NOW);
      expect(parsed.items).toHaveLength(2);
    });

    // The failure mode this guards: a bare ו prefix is usually part of a
    // word, and splitting on it indiscriminately shreds ordinary text.
    it("does not split a word that merely starts with ו", () => {
      const parsed = parseIntention("לבדוק ורידים", NOW);
      expect(parsed.items).toHaveLength(1);
      expect(tasksFrom(parsed)[0].title).toContain("ורידים");
    });
  });

  describe("lead-ins and noise", () => {
    it("strips a leading 'היום אני רוצה ל'", () => {
      const [task] = tasksFrom(parseIntention("היום אני רוצה לסיים את הדוח", NOW));
      expect(task.title).not.toContain("אני רוצה");
      expect(task.title).toContain("הדוח");
    });

    it("strips a bare leading היום", () => {
      const [task] = tasksFrom(parseIntention("היום לסיים את הדוח", NOW));
      expect(task.title).toBe("לסיים את הדוח");
    });

    it("drops filler words", () => {
      const [task] = tasksFrom(parseIntention("גם לקנות חלב", NOW));
      expect(task.title).toBe("לקנות חלב");
    });
  });

  describe("refuses to produce junk", () => {
    it("returns nothing for empty or whitespace input", () => {
      expect(parseIntention("", NOW).items).toEqual([]);
      expect(parseIntention("   ", NOW).items).toEqual([]);
    });

    it("drops punctuation-only fragments", () => {
      expect(parseIntention("לקנות חלב,,,", NOW).items).toHaveLength(1);
    });

    it("does not turn a bare time reference into a task", () => {
      const parsed = parseIntention("לקנות חלב, מחר", NOW);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.unparsed).toContain("מחר");
    });

    it("surfaces ignored fragments rather than silently dropping them", () => {
      const parsed = parseIntention("היום", NOW);
      expect(parsed.items).toHaveLength(0);
      expect(parsed.unparsed.length).toBeGreaterThan(0);
    });

    it("deduplicates repeated items", () => {
      const parsed = parseIntention("לקנות חלב, לקנות חלב", NOW);
      expect(parsed.items).toHaveLength(1);
    });

    it("deduplicates identical blocks", () => {
      const parsed = parseIntention("פגישה ב-14:00, פגישה ב-14:00", NOW);
      expect(blocksFrom(parsed)).toHaveLength(1);
    });
  });

  it("handles a single-item intention with no separators", () => {
    const parsed = parseIntention("לסיים את הדוח", NOW);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.unparsed).toEqual([]);
  });

  it("produces block starts parseLocalDateTime accepts", () => {
    const [block] = blocksFrom(parseIntention("פגישה ב-14:00", NOW));
    expect(block.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
