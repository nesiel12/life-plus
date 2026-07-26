"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { peopleRepo } from "@/lib/db/people";
import { toPerson, toPersonPatch } from "@/lib/mappers";
import type { Database } from "@/types/database";
import type { Person } from "@/types";

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

// The Family CRM edit modal's one save action — covers every editable
// field (name, relation, birthday, anniversary, note, phone, avatar) in
// one call instead of one action per field. The existing single-field
// actions above (birthday/anniversary/interaction) stay as they are for
// the card's own inline "add a date" quick-affordance — this is additive,
// not a replacement.
export async function updatePersonAction(personId: string, patch: Partial<Person>) {
  const userId = await getCurrentUserId();
  const row = await peopleRepo.update(userId, personId, toPersonPatch(patch));
  return toPerson(row);
}

export async function deletePersonAction(personId: string) {
  const userId = await getCurrentUserId();
  await peopleRepo.remove(userId, personId);
}
