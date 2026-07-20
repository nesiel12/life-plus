"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { upcomingEventsRepo } from "@/lib/db/upcomingEvents";
import { toUpcomingEvent } from "@/lib/mappers";
import type { MomentCategory } from "@/types";

export async function addUpcomingEventAction(input: {
  title: string;
  date: string;
  category: MomentCategory;
}) {
  const userId = await getCurrentUserId();
  const row = await upcomingEventsRepo.insert({
    user_id: userId,
    title: input.title,
    event_date: input.date,
    category: input.category,
  });
  return toUpcomingEvent(row);
}
