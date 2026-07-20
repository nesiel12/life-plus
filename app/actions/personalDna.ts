"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { toPersonalDNA } from "@/lib/mappers";
import type { PersonalDNA } from "@/types";

export async function updatePersonalDNAAction(patch: Partial<PersonalDNA>) {
  const userId = await getCurrentUserId();
  const row = await personalDnaRepo.upsert(userId, {
    peak_focus_hours: patch.peakFocusHours,
    learning_style: patch.learningStyle,
    family_check_in_interval_days: patch.familyCheckInIntervalDays,
    habit_notes: patch.habitNotes,
  });
  return toPersonalDNA(row);
}

export async function completeOnboardingAction() {
  const userId = await getCurrentUserId();
  await personalDnaRepo.upsert(userId, { onboarding_complete: true });
}
