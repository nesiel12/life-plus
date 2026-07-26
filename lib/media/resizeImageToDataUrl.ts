const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.82;

// Client-side avatar processing (Family CRM upgrade): center-crops to a
// square and compresses to a JPEG data URL before it ever reaches the
// server, so a photo straight off a phone camera (often several MB)
// doesn't land as-is in a text column. No upload endpoint, no storage
// bucket — the resulting string is just another field in the same update
// call every other person-edit already makes. Browser-only (Image/canvas)
// — only ever called from a "use client" component's event handler, never
// unit-tested here for the same reason ScreenTimeWidget/useVoiceInput
// aren't: it needs real DOM/canvas APIs this project's Vitest setup
// (environment: "node") doesn't provide, and adding jsdom+canvas mocking
// for one small utility would be exactly the speculative test
// infrastructure this codebase avoids building ahead of a second need.
export function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = MAX_DIMENSION;
      canvas.height = MAX_DIMENSION;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX_DIMENSION, MAX_DIMENSION);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}
