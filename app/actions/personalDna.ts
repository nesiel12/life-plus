"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { toPersonalDNA, toPersonalDnaPatch } from "@/lib/mappers";
import type { PersonalDNA } from "@/types";

export async function updatePersonalDNAAction(patch: Partial<PersonalDNA>) {
  const userId = await getCurrentUserId();
  const row = await personalDnaRepo.upsert(userId, toPersonalDnaPatch(patch));
  return toPersonalDNA(row);
}

export async function completeOnboardingAction() {
  const userId = await getCurrentUserId();
  await personalDnaRepo.upsert(userId, { onboarding_complete: true });
}
