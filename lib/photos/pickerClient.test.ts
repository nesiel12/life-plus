import { describe, expect, it } from "vitest";
import { parseDurationMs } from "@/lib/photos/pickerClient";

// parseDurationMs is the one piece of pickerClient with real branching that
// doesn't require a live Google session. It matters more than it looks:
// pollingConfig is re-issued on every poll and disappears entirely once
// mediaItemsSet flips true, so this is called with `undefined` on the happy
// path and must not blow up or return 0 (which would spin a poll loop).
describe("parseDurationMs", () => {
  it("parses the documented seconds format", () => {
    expect(parseDurationMs("5s", 1000)).toBe(5000);
    expect(parseDurationMs("1800s", 1000)).toBe(1_800_000);
  });

  it("parses fractional seconds", () => {
    expect(parseDurationMs("2.5s", 1000)).toBe(2500);
  });

  it("falls back when the field is missing, which is the normal terminal case", () => {
    expect(parseDurationMs(undefined, 3000)).toBe(3000);
  });

  it("falls back rather than returning zero for malformed input", () => {
    for (const bad of ["", "5", "5ms", "abc", "-5s", "0s"]) {
      expect(parseDurationMs(bad, 3000), bad).toBe(3000);
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseDurationMs("  7s  ", 1000)).toBe(7000);
  });
});
