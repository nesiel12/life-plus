"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { peopleRepo } from "@/lib/db/people";
import { goalsRepo } from "@/lib/db/goals";
import { toPersonalDNA, toPersonalDnaPatch, toPerson, toGoal } from "@/lib/mappers";
import { summarizePeakFocus, summarizeSleep } from "@/lib/onboarding/chronotype";
import type { ChronotypeSettings, Goal, LifeAreaKey, PersonalDNA, Person } from "@/types";

// What the 4-step wizard collects. Every step is skippable, so every group is
// optional — a person who skips straight through still gets a valid row with
// onboarding_complete set, rather than being asked again forever.
export interface OnboardingWizardPayload {
  fullName?: string;
  birthDate?: string;
  corePriorities?: LifeAreaKey[];
  chronotype?: ChronotypeSettings;
  people?: { name: string; relation: string; birthday?: string; anniversary?: string }[];
  goals?: { title: string; category: LifeAreaKey; targetDate?: string }[];
  habits?: string[];
}

export interface OnboardingWizardResult {
  personalDNA: PersonalDNA;
  newPeople: Person[];
  newGoals: Goal[];
}

// Steps 3 and 4 write through the relational paths rather than into jsonb on
// personal_dna: contacts belong in `people` (the Relationship CRM, the
// upcoming-moments feed and goals.person_id all join against it) and goals
// belong in `goals`/`milestones` (the Goals Engine). See the migration header.
//
// One action rather than a chain of client-side calls so a slow network can't
// leave the wizard half-committed with the modal already dismissed. It is not
// a transaction — supabase-js has no cross-table transaction primitive — so
// ordering matters: DNA and the user's own content are written first, and
// onboarding_complete is set last. If anything above it throws, the flag stays
// false and the wizard reopens with the work that did land already saved.
export async function saveOnboardingWizardAction(
  payload: OnboardingWizardPayload
): Promise<OnboardingWizardResult> {
  const userId = await getCurrentUserId();

  const patch: Partial<PersonalDNA> = {};
  if (payload.fullName !== undefined) patch.fullName = payload.fullName;
  if (payload.birthDate !== undefined) patch.birthDate = payload.birthDate;
  if (payload.corePriorities !== undefined) patch.corePriorities = payload.corePriorities;
  if (payload.habits !== undefined) patch.habitNotes = payload.habits;
  if (payload.chronotype !== undefined) {
    patch.chronotype = payload.chronotype;
    // Keep the legacy free-text columns in step with the structured ones —
    // lib/intelligence/core/normalize.ts, buildSystemPrompt, the Time & Tasks
    // page and DailyRecommendations all still read those, and silently
    // dropping them would take focus/sleep out of the AI's context.
    const focus = summarizePeakFocus(payload.chronotype);
    if (focus) patch.peakFocusHours = focus;
    const sleep = summarizeSleep(payload.chronotype);
    if (sleep) patch.sleepNotes = sleep;
  }

  const dnaRow = await personalDnaRepo.upsert(userId, toPersonalDnaPatch(patch));

  const newPeople: Person[] = [];
  for (const person of payload.people ?? []) {
    const row = await peopleRepo.insert({
      user_id: userId,
      name: person.name,
      hebrew_name: null,
      relation: person.relation,
      birthday: person.birthday ?? null,
      anniversary: person.anniversary ?? null,
    });
    newPeople.push(toPerson(row));
  }

  const newGoals: Goal[] = [];
  for (const goal of payload.goals ?? []) {
    // No milestones yet: the AI breakdown in GoalsPanel is what generates
    // those, and inventing placeholder steps here would be fabricating a plan
    // the person never agreed to.
    const row = await goalsRepo.createWithMilestones(userId, goal.title, goal.category, [], {
      targetDate: goal.targetDate,
    });
    newGoals.push(toGoal(row));
  }

  const finalRow = await personalDnaRepo.upsert(userId, { onboarding_complete: true });

  return {
    personalDNA: toPersonalDNA(finalRow ?? dnaRow),
    newPeople,
    newGoals,
  };
}
