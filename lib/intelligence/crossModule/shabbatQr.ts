import qrcode from "qrcode-generator";

// Torah <-> the Shabbat sheet: a QR code on the printed page that opens the
// digital lesson it came from, so the paper is a door back into the app.
//
// The sheet is server-rendered HTML that people print or "save as PDF"
// (app/areas/torah/shabbat-print/page.tsx), so the code is drawn as inline SVG
// from the module matrix rather than an <img>: it stays razor-sharp at any
// print size, needs no request, and injects no raw HTML.
//
// The lesson is the user's own and sits behind their sign-in. Scanning the
// sheet as themselves opens it; anyone else lands on the login page. That is
// the right default for a personal study library, and it means the code
// carries nothing but a link — no lesson text, no name.

export const LESSON_PATH_PREFIX = "/areas/torah/lessons/";

/** Lesson ids are opaque (uuids); anything else is refused rather than put in a URL. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The in-app path of a lesson, or null for an id that isn't safe to embed. */
export function lessonDigitalPath(lessonId: string): string | null {
  return SAFE_ID.test(lessonId) ? `${LESSON_PATH_PREFIX}${lessonId}` : null;
}

/** The absolute URL for a lesson, from the deployment's own origin. */
export function lessonDigitalUrl(baseUrl: string, lessonId: string): string | null {
  const path = lessonDigitalPath(lessonId);
  if (!path) return null;
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export interface QrCode {
  /** Modules per side, excluding the quiet zone. */
  size: number;
  /** SVG path data in module units (1 module = 1 unit), one run per row. */
  path: string;
  /** Empty modules required around the code for a scanner to find it. */
  quietZone: number;
}

/** The QR spec asks for four modules of clear space on every side. */
export const QR_QUIET_ZONE = 4;

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

/**
 * Encodes `text` as a QR code. Level M (about 15% recoverable) is the default:
 * enough that a smudge or a fold doesn't defeat a printed sheet, without
 * inflating a short URL into a dense, hard-to-scan grid.
 *
 * The text must be ASCII — this library's default byte encoding is not UTF-8,
 * and a link built by lessonDigitalUrl is ASCII by construction. Anything else
 * throws rather than encoding something that would scan as garbage.
 */
export function encodeQr(text: string, level: QrErrorCorrection = "M"): QrCode {
  if (!/^[\x20-\x7e]+$/.test(text)) throw new Error("QR text must be printable ASCII");

  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();

  // One run per horizontal stretch of dark modules: a fraction of the size of
  // a rect per module, and it renders without hairline seams between them.
  const runs: string[] = [];
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!qr.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < size && qr.isDark(row, col)) col++;
      runs.push(`M${start} ${row}h${col - start}v1h-${col - start}z`);
    }
  }

  return { size, path: runs.join(""), quietZone: QR_QUIET_ZONE };
}

/** The viewBox that frames a code with its quiet zone. */
export function qrViewBox(code: QrCode): string {
  const total = code.size + code.quietZone * 2;
  return `${-code.quietZone} ${-code.quietZone} ${total} ${total}`;
}
