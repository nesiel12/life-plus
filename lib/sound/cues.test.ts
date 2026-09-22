import { describe, expect, it } from "vitest";
import { cuePlan, playCue, primeAudio, type CueEvent } from "@/lib/sound/cues";

describe("cue plans", () => {
  it("rise in pitch as the streak grows", () => {
    expect(cuePlan("correct", 5)[0].freq).toBeGreaterThan(cuePlan("correct", 1)[0].freq);
  });

  it("are short and quiet", () => {
    for (const event of ["correct", "shaky", "miss", "tier-up", "finish", "pop", "tick", "chime", "level-up", "spotlight"] as const) {
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

describe("learning lab cues", () => {
  const LAB: CueEvent[] = ["pop", "tick", "chime", "level-up", "spotlight"];

  it("all have notes to play", () => {
    for (const event of LAB) expect(cuePlan(event, 3).length, event).toBeGreaterThan(0);
  });

  it("make the shuffle tick climb as the roll goes on, up to a ceiling", () => {
    const freq = (step: number) => cuePlan("tick", step)[0].freq;
    expect(freq(10)).toBeGreaterThan(freq(1));
    expect(freq(1000)).toBe(freq(500));
    expect(freq(0)).toBeGreaterThan(0);
    expect(freq(-4)).toBe(freq(0));
  });

  it("keeps a tick shorter than a click on a trackpad, so a fast roll is not a buzz", () => {
    expect(cuePlan("tick", 5)[0].duration).toBeLessThan(0.05);
  });

  it("makes a level-up longer and richer than a chime", () => {
    expect(cuePlan("level-up").length).toBeGreaterThan(cuePlan("chime").length);
  });

  it("stays consonant: every note is on the shared pentatonic ladder or is a tick", () => {
    for (const event of LAB.filter((e) => e !== "tick")) {
      for (const note of cuePlan(event)) expect(note.freq, event).toBeGreaterThanOrEqual(523.25);
    }
  });

  it("never throw where there is no audio", () => {
    for (const event of LAB) expect(() => playCue(event, 2)).not.toThrow();
    expect(() => primeAudio()).not.toThrow();
  });
});

