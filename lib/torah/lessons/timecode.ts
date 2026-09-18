// Timecodes for the lessons module — "12:34", "1:02:03", ISO-8601 durations.
//
// Pure. Every timestamp a model returns passes through parseTimecode before it
// is stored, because a model asked for "MM:SS" will sometimes answer "12.34",
// "1:02:03" or "00:75", and a seek to NaN is a player that silently stops.

/** "MM:SS", "M:SS", "HH:MM:SS" or plain seconds → seconds; null when unparseable. */
export function parseTimecode(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  if (!value) return null;

  const clean = value.trim().replace(/[.,]/g, ":");
  if (/^\d+$/.test(clean)) return Number.parseInt(clean, 10);

  const parts = clean.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;

  const numbers = parts.map((p) => Number.parseInt(p, 10));
  if (numbers.length === 2) {
    const [minutes, seconds] = numbers;
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }
  const [hours, minutes, seconds] = numbers;
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/** Seconds → "M:SS", or "H:MM:SS" past the hour. */
export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

/** Seconds → the zero-padded "MM:SS" / "HH:MM:SS" form models are prompted with. */
export function promptTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** YouTube Data API's ISO-8601 duration ("PT1H2M3S") → seconds. */
export function parseIsoDuration(value: string | null | undefined): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value?.trim() ?? "");
  if (!match || value === "P" || value === "PT") return null;
  const [, days, hours, minutes, seconds] = match.map((part) => (part ? Number.parseInt(part, 10) : 0));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/** "שעה ו-12 דקות" style label for a duration, for the lesson list. */
export function durationLabel(totalSeconds: number | null | undefined): string | null {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 1) return "פחות מדקה";
  if (minutes < 60) return `${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ש׳` : `${hours} ש׳ ${rest} דק׳`;
}
