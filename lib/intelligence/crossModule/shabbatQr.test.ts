import qrcode from "qrcode-generator";
import { describe, expect, it } from "vitest";
import {
  QR_QUIET_ZONE,
  encodeQr,
  lessonDigitalPath,
  lessonDigitalUrl,
  qrViewBox,
} from "@/lib/intelligence/crossModule/shabbatQr";

const UUID = "3f2b8c1e-9a4d-4c6b-8e7f-1234567890ab";

/** Rebuilds the module grid from the SVG path this module emits — what a renderer draws. */
function rasterize(path: string, size: number): boolean[][] {
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const [, x, y, w] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(w); i++) grid[Number(y)][Number(x) + i] = true;
  }
  return grid;
}

describe("lessonDigitalPath / lessonDigitalUrl", () => {
  it("points at the lesson's page in the Torah space", () => {
    expect(lessonDigitalPath(UUID)).toBe(`/areas/torah/lessons/${UUID}`);
    expect(lessonDigitalUrl("https://app.example.com", UUID)).toBe(`https://app.example.com/areas/torah/lessons/${UUID}`);
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(lessonDigitalUrl("https://app.example.com/", UUID)).toBe(`https://app.example.com/areas/torah/lessons/${UUID}`);
    expect(lessonDigitalUrl("http://localhost:3000///", "abc")).toBe("http://localhost:3000/areas/torah/lessons/abc");
  });

  it("refuses an id that could alter the URL rather than embedding it", () => {
    for (const id of ["", "../secret", "a/b", "a b", "id?x=1", "id#frag", "a".repeat(65), "שיעור"]) {
      expect(lessonDigitalPath(id), id).toBeNull();
      expect(lessonDigitalUrl("https://x.test", id), id).toBeNull();
    }
  });
});

describe("encodeQr", () => {
  const url = `https://app.example.com/areas/torah/lessons/${UUID}`;

  it("produces a valid QR size (17 + 4 × version)", () => {
    const { size } = encodeQr(url);
    expect((size - 17) % 4).toBe(0);
    const version = (size - 17) / 4;
    expect(version).toBeGreaterThanOrEqual(1);
    expect(version).toBeLessThanOrEqual(40);
  });

  it("matches the library's own matrix module for module", () => {
    const code = encodeQr(url, "M");
    const reference = qrcode(0, "M");
    reference.addData(url);
    reference.make();

    const grid = rasterize(code.path, code.size);
    expect(code.size).toBe(reference.getModuleCount());
    for (let row = 0; row < code.size; row++) {
      for (let col = 0; col < code.size; col++) {
        expect(grid[row][col], `${row},${col}`).toBe(reference.isDark(row, col));
      }
    }
  });

  it("carries the three finder patterns every scanner locks onto", () => {
    const { path, size } = encodeQr(url);
    const grid = rasterize(path, size);
    // 7×7: solid ring, light ring, solid 3×3 centre.
    const finderAt = (top: number, left: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
          const expected = ring === 3 || ring <= 1;
          expect(grid[top + r][left + c], `finder ${top},${left} @ ${r},${c}`).toBe(expected);
        }
      }
    };
    finderAt(0, 0);
    finderAt(0, size - 7);
    finderAt(size - 7, 0);
  });

  it("is deterministic", () => {
    expect(encodeQr(url)).toEqual(encodeQr(url));
  });

  it("gives different lessons different codes", () => {
    expect(encodeQr(url).path).not.toBe(encodeQr(url.replace("3f2b", "4f2b")).path);
  });

  it("uses more modules for a stronger error-correction level", () => {
    expect(encodeQr(url, "H").size).toBeGreaterThanOrEqual(encodeQr(url, "L").size);
  });

  it("frames the code with the quiet zone the QR spec asks for", () => {
    const code = encodeQr(url);
    expect(code.quietZone).toBe(QR_QUIET_ZONE);
    expect(QR_QUIET_ZONE).toBeGreaterThanOrEqual(4);
    const total = code.size + QR_QUIET_ZONE * 2;
    expect(qrViewBox(code)).toBe(`${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${total} ${total}`);
  });

  it("stays inside its own bounds", () => {
    const { path, size } = encodeQr(url);
    for (const [, x, y, w] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      expect(Number(x) + Number(w)).toBeLessThanOrEqual(size);
      expect(Number(y)).toBeLessThan(size);
    }
  });

  it("refuses text it cannot encode faithfully rather than printing a code that scans as garbage", () => {
    expect(() => encodeQr("")).toThrow();
    expect(() => encodeQr("שיעור")).toThrow(/ASCII/);
    expect(() => encodeQr("line\nbreak")).toThrow();
  });
});
