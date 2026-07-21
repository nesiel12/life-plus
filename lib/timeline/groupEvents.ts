import { daysSince } from "@/lib/utils";
import type { TimelineEvent } from "@/lib/timeline/types";

export interface TimelineEventGroup {
  label: string;
  events: TimelineEvent[];
}

// Natural, calendar-day grouping using the same relative-day vocabulary
// already established elsewhere in the app (daysSince/daysUntil — Family's
// stale-contact copy, the upcoming-events list) rather than a second
// date-labeling scheme invented just for the Timeline.
function labelForDaysSince(diff: number, timestamp: string): string {
  if (diff === 0) return "היום";
  if (diff === 1) return "אתמול";
  if (diff > 1 && diff < 7) {
    return new Date(timestamp).toLocaleDateString("he-IL", { weekday: "long" });
  }
  return new Date(timestamp).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Assumes `events` arrives newest-first (buildTimelineEvents's contract) —
// groups consecutive events that fall on the same calendar day under one
// header instead of repeating a date on every card. Grouping by the label
// string itself (rather than a computed day-boundary key) is safe here:
// within one grouping pass, "today"/"yesterday" each occur at most once,
// the weekday-name label only fires for a single occurrence of that weekday
// (2–6 days back), and anything older carries a full year-qualified date —
// so two distinct calendar days can never collide under the same label.
export function groupEventsByDate(events: TimelineEvent[]): TimelineEventGroup[] {
  const groups: TimelineEventGroup[] = [];

  for (const event of events) {
    const label = labelForDaysSince(daysSince(event.timestamp), event.timestamp);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.label === label) {
      lastGroup.events.push(event);
    } else {
      groups.push({ label, events: [event] });
    }
  }

  return groups;
}
