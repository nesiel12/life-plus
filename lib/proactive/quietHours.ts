// Quiet-hours arithmetic. A window can wrap midnight (start 22, end 7).
// Pure — no Date, caller passes the local hour.

/** True if `hour` (0–23, user-local) falls inside the quiet window. */
export function isWithinQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false; // zero-width window = never quiet
  if (start < end) return hour >= start && hour < end; // same-day window
  return hour >= start || hour < end; // wraps midnight
}

/**
 * The next local hour at or after `fromHour` that is outside the quiet window.
 * Returns `fromHour` unchanged when it's already fine. Never loops forever —
 * a full day is at most 24 steps.
 */
export function nextAllowedHour(fromHour: number, start: number, end: number): number {
  let h = ((fromHour % 24) + 24) % 24;
  for (let i = 0; i < 24; i++) {
    if (!isWithinQuietHours(h, start, end)) return h;
    h = (h + 1) % 24;
  }
  return fromHour; // window is all-day (shouldn't happen: start===end handled above)
}
