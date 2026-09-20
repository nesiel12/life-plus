import { describe, expect, it } from "vitest";
import { cuePlan, playCue } from "@/lib/sound/cues";

describe("cue plans", () => {
  it("rise in pitch as the streak grows", () => {
    expect(cuePlan("correct", 5)[0].freq).toBeGreaterThan(cuePlan("correct", 1)[0].freq);
  });

  it("are short and quiet", () => {
    for (const event of ["correct", "shaky", "miss", "tier-up", "finish"] as const) {
      for (const note of cuePlan(event, 3)) {
        expect(note.at + note.duration).toBeLessThanOrEqual(0.7);
        expect(note.gain).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("descend for a miss", () => {
    const [first, second] = cuePlan("miss");
    expect(second.freq).toBeLessThan(first.freq);
  });

  it("never throw where there is no audio", () => {
    expect(() => playCue("correct")).not.toThrow();
  });
});
