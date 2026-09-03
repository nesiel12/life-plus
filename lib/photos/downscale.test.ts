import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  AVATAR_MAX_EDGE,
  CARD_MAX_EDGE,
  downscaleImage,
  MAX_STORED_BYTES,
} from "@/lib/photos/downscale";

// Real images through the real encoder — mocking sharp here would test nothing,
// since every property that matters (dimensions, byte size, orientation) is
// produced by sharp itself.
async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 140, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("downscaleImage", () => {
  it("fits a large photo inside the card edge, preserving aspect ratio", async () => {
    const input = await makeImage(4032, 3024); // a phone camera photo
    const result = await downscaleImage(input);

    expect(Math.max(result.width, result.height)).toBe(CARD_MAX_EDGE);
    // 4:3 in, 4:3 out.
    expect(result.width / result.height).toBeCloseTo(4 / 3, 2);
  });

  it("does not enlarge an image already smaller than the target", async () => {
    const input = await makeImage(320, 240);
    const result = await downscaleImage(input);

    expect(result.width).toBe(320);
    expect(result.height).toBe(240);
  });

  it("honours a smaller max edge for avatars", async () => {
    const input = await makeImage(2000, 2000);
    const result = await downscaleImage(input, AVATAR_MAX_EDGE);

    expect(result.width).toBe(AVATAR_MAX_EDGE);
    expect(result.height).toBe(AVATAR_MAX_EDGE);
  });

  it("produces a genuinely small artifact, well under the cap", async () => {
    const input = await makeImage(4032, 3024);
    const result = await downscaleImage(input);

    expect(result.byteSize).toBeLessThan(MAX_STORED_BYTES);
    expect(result.byteSize).toBe(result.data.byteLength);
  });

  it("always re-encodes as jpeg, whatever went in", async () => {
    const png = await sharp({
      create: { width: 800, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const result = await downscaleImage(png);
    expect(result.mimeType).toBe("image/jpeg");
    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("strips EXIF, so GPS coordinates are not retained", async () => {
    // withMetadata() bakes in an EXIF block; the pipeline must drop it.
    const withExif = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "test", Software: "test" } } })
      .toBuffer();

    const result = await downscaleImage(withExif);
    const meta = await sharp(result.data).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("rejects input that is not an image rather than storing garbage", async () => {
    await expect(downscaleImage(Buffer.from("this is not an image"))).rejects.toThrow();
  });
});
