"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { momentsRepo } from "@/lib/db/moments";
import { toMoment } from "@/lib/mappers";
import type { MomentCategory } from "@/types";

export async function addMomentAction(input: {
  category: MomentCategory;
  title: string;
  content: string;
  personId?: string;
}) {
  const userId = await getCurrentUserId();
  const row = await momentsRepo.insert({
    user_id: userId,
    category: input.category,
    title: input.title,
    content: input.content,
    person_id: input.personId ?? null,
  });
  return toMoment(row);
}
