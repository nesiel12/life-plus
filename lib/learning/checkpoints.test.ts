import { describe, expect, it } from "vitest";
import {
  MAX_CHECKPOINTS,
  MIN_SPACING_SECONDS,
  MIN_START_SECONDS,
  checkpointWindows,
  checkpointScore,
  dueCheckpoint,
  normalizeCheckpoints,
  parseCheckpointTime,
  readAnswers,
  type RawCheckpoint,
} from "@/lib/learning/checkpoints";

const cp = (atSeconds: number, extra: Partial<RawCheckpoint> = {}): RawCheckpoint => ({
  atSeconds,
  question: `שאלה ב-${atSeconds}`,
  options: ["א", "ב", "ג"],
  correctIndex: 1,
  explanation: "הסבר",
  ...extra,
});

describe("normalizeCheckpoints", () => {
  it("sorts by time and derives stable ids", () => {
    const out = normalizeCheckpoints([cp(300), cp(120)]);
    expect(out.map((c) => c.id)).toEqual(["cp-120", "cp-300"]);
  });

  it("drops malformed checkpoints", () => {
    const out = normalizeCheckpoints([
      cp(100, { options: ["רק אחת"] }),
      cp(200, { correctIndex: 5 }),
      cp(300, { question: "  " }),
      cp(400, { options: ["זהה", "זהה"] }),
      cp(500),
    ]);
    expect(out.map((c) => c.atSeconds)).toEqual([500]);
  });

  it("keeps stops out of the opening and past the end", () => {
    expect(normalizeCheckpoints([cp(10), cp(598), cp(640), cp(200)], 600).map((c) => c.atSeconds)).toEqual([200]);
  });

  it("spaces stops at least a minute apart and caps their number", () => {
    expect(normalizeCheckpoints([cp(100), cp(130), cp(170)]).map((c) => c.atSeconds)).toEqual([100, 170]);
    const many = Array.from({ length: 20 }, (_, i) => cp(60 + i * 90));
    expect(normalizeCheckpoints(many)).toHaveLength(MAX_CHECKPOINTS);
  });

  it("keeps at most four options", () => {
    expect(normalizeCheckpoints([cp(100, { options: ["1", "2", "3", "4", "5"] })])[0].options).toHaveLength(4);
  });
});

describe("dueCheckpoint", () => {
  const checkpoints = normalizeCheckpoints([cp(100), cp(250)]);

  it("stops when playback crosses a checkpoint", () => {
    expect(dueCheckpoint(checkpoints, 99.6, 100.1, new Set())?.id).toBe("cp-100");
  });

  it("does not stop for a seek past it, or backwards", () => {
    expect(dueCheckpoint(checkpoints, 50, 260, new Set())).toBeNull();
    expect(dueCheckpoint(checkpoints, 120, 99, new Set())).toBeNull();
  });

  it("never stops twice for a handled checkpoint", () => {
    expect(dueCheckpoint(checkpoints, 99.6, 100.1, new Set(["cp-100"]))).toBeNull();
  });
});

describe("scoring", () => {
  const checkpoints = normalizeCheckpoints([cp(100), cp(250), cp(400)]);

  it("counts answered and correct", () => {
    expect(
      checkpointScore(checkpoints, {
        "cp-100": { choice: 1, correct: true, answeredAt: "" },
        "cp-250": { choice: 0, correct: false, answeredAt: "" },
      })
    ).toEqual({ answered: 2, correct: 1, total: 3 });
  });

  it("reads stored answers defensively", () => {
    expect(readAnswers(null)).toEqual({});
    expect(readAnswers({ a: { choice: 1, correct: true }, b: { junk: true } })).toEqual({ a: { choice: 1, correct: true, answeredAt: "" } });
  });
});

describe("checkpointWindows", () => {
  it("spreads the stops across the whole video, not just its opening", () => {
    const windows = checkpointWindows(1106);
    expect(windows).toHaveLength(5);
    expect(windows[0].fromSeconds).toBe(MIN_START_SECONDS);
    expect(windows[windows.length - 1].toSeconds).toBeGreaterThan(1000);
    for (let i = 1; i < windows.length; i++) expect(windows[i].fromSeconds).toBe(windows[i - 1].toSeconds);
  });

  it("gives every window room for the minimum spacing", () => {
    for (const duration of [100, 200, 400, 900, 3600]) {
      const windows = checkpointWindows(duration);
      for (const w of windows) expect(w.toSeconds).toBeGreaterThan(w.fromSeconds);
      if (windows.length > 1) expect(windows[0].toSeconds - windows[0].fromSeconds).toBeGreaterThanOrEqual(MIN_SPACING_SECONDS / 2);
    }
  });

  it("scales the count with length and caps it", () => {
    expect(checkpointWindows(300)).toHaveLength(3);
    expect(checkpointWindows(600)).toHaveLength(4);
    expect(checkpointWindows(36_000)).toHaveLength(5);
    expect(checkpointWindows(36_000).length).toBeLessThanOrEqual(MAX_CHECKPOINTS);
  });

  it("offers none for a clip too short to interrupt", () => {
    expect(checkpointWindows(60)).toEqual([]);
  });
});

describe("parseCheckpointTime", () => {
  it("reads MM:SS and H:MM:SS", () => {
    expect(parseCheckpointTime("06:43")).toBe(403);
    expect(parseCheckpointTime("18:21")).toBe(1101);
    expect(parseCheckpointTime(" 1:02:03 ")).toBe(3723);
  });

  it("refuses a bare number — the model once returned 4:03 as 403", () => {
    expect(parseCheckpointTime("403")).toBeNull();
    expect(parseCheckpointTime("1821")).toBeNull();
  });

  it("refuses nonsense", () => {
    expect(parseCheckpointTime("")).toBeNull();
    expect(parseCheckpointTime(null)).toBeNull();
    expect(parseCheckpointTime("7:99")).toBeNull();
    expect(parseCheckpointTime("soon")).toBeNull();
  });
});
