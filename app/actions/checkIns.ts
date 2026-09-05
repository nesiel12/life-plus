"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { checkInsRepo } from "@/lib/db/checkIns";
import { toCheckIn } from "@/lib/mappers";
import { CHECK_IN_ACTIVITIES, type CheckInActivity } from "@/types";

/**
 * How much history the profile is built from.
 *
 * Bounded rather than "everything": the routine being learned is the current
 * one, and a year-old pattern from a different job would drag every average
 * toward a life the user no longer lives. It is also the page size, so the
 * widget never pulls an unbounded table down to decide whether to prompt.
 */
const PROFILE_WINDOW = 200;

export async function listCheckInsAction() {
  const userId = await getCurrentUserId();
  const rows = await checkInsRepo.list(userId);
  return rows.slice(0, PROFILE_WINDOW).map(toCheckIn);
}

export async function addCheckInAction(input: {
  activity: CheckInActivity;
  energy: number;
  note?: string;
  /** Defaults to now. Supplied when reporting on an earlier stretch. */
  occurredAt?: string;
}) {
  const userId = await getCurrentUserId();

  // Validated here, not only in the widget. A server action is a public
  // endpoint: anything reachable from the client is reachable directly, and
  // a stray energy of 0 or 9 would skew every average with no way to tell
  // afterwards which rows were wrong. The DB has the same CHECK — this
  // exists so the failure is a clear error rather than a constraint
  // violation surfacing as a 500.
  if (!CHECK_IN_ACTIVITIES.includes(input.activity)) {
    throw new Error("פעילות לא מוכרת.");
  }
  const energy = Math.round(input.energy);
  if (!Number.isFinite(energy) || energy < 1 || energy > 5) {
    throw new Error("רמת האנרגיה חייבת להיות בין 1 ל-5.");
  }

  const row = await checkInsRepo.insert({
    user_id: userId,
    activity: input.activity,
    energy,
    note: input.note?.trim() || null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  });
  return toCheckIn(row);
}

export async function deleteCheckInAction(checkInId: string) {
  const userId = await getCurrentUserId();
  await checkInsRepo.remove(userId, checkInId);
}
