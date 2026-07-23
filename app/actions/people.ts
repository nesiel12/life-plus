"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { peopleRepo } from "@/lib/db/people";
import { toPerson } from "@/lib/mappers";
import type { Database } from "@/types/database";

type PersonUpdate = Database["public"]["Tables"]["people"]["Update"];

export async function addPersonAction(input: {
  name: string;
  hebrewName?: string;
  relation: string;
  birthday?: string;
  anniversary?: string;
}) {
  const userId = await getCurrentUserId();
  const row = await peopleRepo.insert({
    user_id: userId,
    name: input.name,
    hebrew_name: input.hebrewName ?? null,
    relation: input.relation,
    birthday: input.birthday ?? null,
    anniversary: input.anniversary ?? null,
  });
  return toPerson(row);
}

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

export async function setPersonAnniversaryAction(personId: string, anniversary: string) {
  const userId = await getCurrentUserId();
  const row = await peopleRepo.update(userId, personId, { anniversary });
  return toPerson(row);
}
