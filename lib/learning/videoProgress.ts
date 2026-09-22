// Remembering where someone was in a video, and when they have "watched" it.

/** How much of a video counts as watched — the outro and credits don't have to be sat through. */
export const WATCHED_FRACTION = 0.9;

export interface SavedPosition {
  /** Seconds in. */
  t: number;
  /** Total seconds. */
  d: number;
}

/** A stored value, validated. Anything malformed is "nothing saved". */
export function parseSavedPosition(raw: unknown): SavedPosition | null {
  if (!raw || typeof raw !== "object") return null;
  const { t, d } = raw as { t?: unknown; d?: unknown };
  return typeof t === "number" && typeof d === "number" && Number.isFinite(t) && Number.isFinite(d) && t >= 0 && d > 0
    ? { t, d }
    : null;
}

/**
 * Where to resume from: the saved spot, unless it isn't worth resuming — right at
 * the start (nothing to pick up) or in the last few seconds (they finished it, so
 * starting from the final seconds would be strange).
 */
export function resumePoint(saved: SavedPosition | null): number {
  if (!saved || saved.t < 5 || saved.d <= 0 || saved.d - saved.t < 10) return 0;
  return Math.floor(saved.t);
}

/**
 * What YouTube's player error codes mean, in words a person can act on. The codes
 * are documented: 2 a bad video id, 5 an HTML5 player problem, 100 a removed or
 * private video, 101 and 150 a video whose owner has switched embedding off.
 * Anything else falls back to a general line rather than a number.
 */
export function videoErrorMessage(code: number | null | undefined): string {
  switch (code) {
    case 2:
      return "הקישור לסרטון לא תקין.";
    case 5:
      return "הנגן לא הצליח להריץ את הסרטון בדפדפן הזה.";
    case 100:
      return "הסרטון לא נמצא — ייתכן שהוסר או שהוא פרטי.";
    case 101:
    case 150:
      return "בעל הסרטון לא מאפשר לנגן אותו מחוץ ל-YouTube.";
    default:
      return "לא הצלחנו לטעון את הנגן.";
  }
}

/** Has enough of the video played to call it watched? */
export function isWatched(currentSeconds: number, durationSeconds: number): boolean {
  return durationSeconds > 0 && currentSeconds / durationSeconds >= WATCHED_FRACTION;
}
