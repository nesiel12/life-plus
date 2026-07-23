// The Goals Engine's real "timeline" (docs/ATLAS_ARCHITECTURE_VISION.md
// §13): a goal's target_date (already existed) spread deterministically
// across its milestones, rather than trusting an LLM's date arithmetic —
// the same discipline every other precision-sensitive computation in this
// app follows (dates, confidence scores, timezone math are all deterministic
// code, never model output). Evenly spaced, last milestone lands on the
// target date itself.
export function distributeMilestoneDates(
  count: number,
  startDate: Date,
  targetDate: Date | null
): (string | null)[] {
  if (count === 0) return [];
  if (!targetDate || targetDate.getTime() <= startDate.getTime()) {
    return new Array(count).fill(null);
  }

  const totalMs = targetDate.getTime() - startDate.getTime();
  return Array.from({ length: count }, (_, i) => {
    const fraction = (i + 1) / count;
    const dueMs = startDate.getTime() + totalMs * fraction;
    return new Date(dueMs).toISOString().slice(0, 10); // "YYYY-MM-DD"
  });
}
