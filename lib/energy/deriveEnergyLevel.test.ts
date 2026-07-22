import { describe, expect, it } from "vitest";
import { deriveEnergyLevel } from "@/lib/energy/deriveEnergyLevel";

describe("deriveEnergyLevel", () => {
  it('returns "unknown" with no rationale-fabricating claim when no patterns exist yet', () => {
    const reading = deriveEnergyLevel([], 9);
    expect(reading.level).toBe("unknown");
    expect(reading.matchingAreas).toEqual([]);
  });

  it('returns "peak" when the current hour matches a real pattern\'s window', () => {
    // hour 9 -> "morning" per hourToWindow's own boundaries.
    const reading = deriveEnergyLevel([{ area: "faith", window: "morning", confidence: 0.8 }], 9);
    expect(reading.level).toBe("peak");
    expect(reading.matchingAreas).toEqual(["faith"]);
  });

  it('returns "typical", never "low", when no pattern matches the current hour', () => {
    // hour 9 -> "morning"; pattern is "evening" -> no match.
    const reading = deriveEnergyLevel([{ area: "career", window: "evening", confidence: 0.8 }], 9);
    expect(reading.level).toBe("typical");
    expect(reading.matchingAreas).toEqual([]);
  });

  it("lists every matching area when more than one area peaks at the current hour", () => {
    const reading = deriveEnergyLevel(
      [
        { area: "faith", window: "morning", confidence: 0.6 },
        { area: "health", window: "morning", confidence: 0.5 },
        { area: "career", window: "evening", confidence: 0.7 },
      ],
      9
    );
    expect(reading.level).toBe("peak");
    expect(reading.matchingAreas).toEqual(["faith", "health"]);
  });
});
