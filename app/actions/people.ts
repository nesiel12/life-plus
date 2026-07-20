"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { peopleRepo } from "@/lib/db/people";
import { toPerson } from "@/lib/mappers";
import type { Database } from "@/types/database";

type PersonUpdate = Database["public"]["Tables"]["people"]["Update"];

export async function logPersonInteractionAction(personId: string, note?: string) {
  const userId = await getCurrentUserId();
  const patch: PersonUpdate = { last_meaningful_interaction: new Date().toISOString() };
  if (note !== undefined) patch.note = note;
  const row = await peopleRepo.update(userId, personId, patch);
  return toPerson(row);
}

export async function setPersonBirthdayAction(personId: string, birthday: string) {
  const userId = await getCurrentUserId();
  const row = await peopleRepo.update(userId, personId, { birthday });
  return toPerson(row);
}
