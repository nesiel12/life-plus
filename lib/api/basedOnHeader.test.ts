import { describe, expect, it } from "vitest";
import { decodeBasedOnHeader, encodeBasedOnHeader } from "@/lib/api/basedOnHeader";

describe("encodeBasedOnHeader / decodeBasedOnHeader", () => {
  it("round-trips Hebrew text — the exact case that crashed in production", () => {
    const basedOn = ["לא יצרת קשר עם אמא כבר 10 ימים — כדאי להתקשר.", "היעד עם המדד הכי נמוך כרגע"];
    const encoded = encodeBasedOnHeader(basedOn);
    expect(decodeBasedOnHeader(encoded)).toEqual(basedOn);
  });

  it("produces a Latin-1-safe (ASCII-only) header value", () => {
    const encoded = encodeBasedOnHeader(["עברית"]);
    expect(/^[\x00-\xFF]*$/.test(encoded)).toBe(true);
  });

  it("round-trips an empty list", () => {
    expect(decodeBasedOnHeader(encodeBasedOnHeader([]))).toEqual([]);
  });

  it("returns an empty list for a missing header, never throwing", () => {
    expect(decodeBasedOnHeader(null)).toEqual([]);
  });

  it("returns an empty list for a malformed header instead of throwing", () => {
    expect(decodeBasedOnHeader("not valid % encoding %")).toEqual([]);
  });
});
