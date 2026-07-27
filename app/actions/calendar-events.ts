"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { manualEventsRepo } from "@/lib/db/manual-events";
import { toManualEvent, toManualEventPatch } from "@/lib/mappers";
import type { ManualEvent, MomentCategory } from "@/types";

// Manual (user-created) calendar events — distinct from Google Calendar
// events (app/api/calendar/*, read-only from this app's side) and from
// tasks. Named app/actions/calendar-events.ts rather than
// app/actions/manual-events.ts to read naturally as "the actions behind
// the calendar's manually-created events," matching lib/db/manual-events.ts
// underneath it.
export async function addManualEventAction(input: {
  title: string;
  startTime: string;
  endTime: string;
  category?: MomentCategory;
  reminderMinutes?: number;
  linkedContactIds?: string[];
}) {
  const userId = await getCurrentUserId();
  const row = await manualEventsRepo.insert({
    user_id: userId,
    title: input.title,
    start_time: input.startTime,
    end_time: input.endTime,
    category: input.category ?? null,
    reminder_minutes: input.reminderMinutes ?? null,
    linked_contact_ids: input.linkedContactIds ?? [],
  });
  return toManualEvent(row);
}

export async function updateManualEventAction(eventId: string, patch: Partial<ManualEvent>) {
  const userId = await getCurrentUserId();
  const row = await manualEventsRepo.update(userId, eventId, toManualEventPatch(patch));
  return toManualEvent(row);
}

export async function deleteManualEventAction(eventId: string) {
  const userId = await getCurrentUserId();
  await manualEventsRepo.remove(userId, eventId);
}
