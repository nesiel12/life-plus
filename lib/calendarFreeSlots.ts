// Pure — no server-only imports — so it stays unit-testable without pulling
// in DB access via app/api/calendar/suggestions/route.ts's other imports
// (buildAtlasContext, etc.).
const MIN_SLOT_MINUTES = 30;

export function computeFreeSlots(busy: { start: string; end: string }[], from: Date, to: Date) {
  const sorted = [...busy]
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: { start: Date; end: Date }[] = [];
  let cursor = from;

  for (const period of sorted) {
    if (period.start.getTime() > cursor.getTime()) {
      slots.push({ start: cursor, end: period.start });
    }
    if (period.end.getTime() > cursor.getTime()) {
      cursor = period.end;
    }
  }
  if (cursor.getTime() < to.getTime()) {
    slots.push({ start: cursor, end: to });
  }

  return slots.filter(
    (s) => (s.end.getTime() - s.start.getTime()) / 60_000 >= MIN_SLOT_MINUTES
  );
}
