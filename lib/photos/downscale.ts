import "server-only";
import sharp from "sharp";

// Downscaling is what makes storing photos at all defensible — see the header
// of supabase/migrations/20260903000000_photo_memories.sql for the decision
// this implements. We keep a card-sized derivative, never the original, so the
// corpus stays small and the stored artifact is genuinely a thumbnail rather
// than a mirror of the user's library.

/** Long edge, in pixels. A memory card is never displayed larger than this. */
export const CARD_MAX_EDGE = 640;
/** Avatars are displayed at 28-72px; 256 covers retina without waste. */
export const AVATAR_MAX_EDGE = 256;

/** Hard ceiling. Anything above this is rejected rather than silently stored. */
export const MAX_STORED_BYTES = 400 * 1024;

export interface DownscaleResult {
  data: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  byteSize: number;
}

export class ImageTooLargeError extends Error {
  constructor(byteSize: number) {
    super(`Downscaled image is ${byteSize} bytes, above the ${MAX_STORED_BYTES} limit.`);
    this.name = "ImageTooLargeError";
  }
}

/**
 * Fits an image inside `maxEdge` and re-encodes it as progressive JPEG.
 *
 * `withoutEnlargement` matters: a photo already smaller than the target is
 * left at its own size rather than being upscaled into a bigger, blurrier file
 * — upscaling would defeat the entire point of this module.
 *
 * EXIF is dropped by not calling `.withMetadata()`. That is deliberate and
 * privacy-relevant: camera photos carry GPS coordinates, and this app has no
 * reason to retain the user's location history as a side effect of showing
 * them a memory. Orientation is still applied first via `.rotate()`, so
 * dropping the tag does not leave the image sideways.
 */
export async function downscaleImage(
  input: Buffer | Uint8Array,
  maxEdge: number = CARD_MAX_EDGE,
  quality = 78
): Promise<DownscaleResult> {
  const pipeline = sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, progressive: true, mozjpeg: true });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  if (data.byteLength > MAX_STORED_BYTES) {
    // One retry at lower quality before giving up, since a single noisy photo
    // shouldn't fail an entire import batch.
    const retry = await sharp(input)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 60, progressive: true, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    if (retry.data.byteLength > MAX_STORED_BYTES) {
      throw new ImageTooLargeError(retry.data.byteLength);
    }
    return {
      data: retry.data,
      mimeType: "image/jpeg",
      width: retry.info.width,
      height: retry.info.height,
      byteSize: retry.data.byteLength,
    };
  }

  return {
    data,
    mimeType: "image/jpeg",
    width: info.width,
    height: info.height,
    byteSize: data.byteLength,
  };
}
