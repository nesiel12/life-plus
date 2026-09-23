import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { TeachingModeDb, UserAgeGroupDb } from "@/types/database";

const repo = createUserScopedRepo("pioneer_easter_egg_claims");

export const pioneerEasterEggClaimsRepo = {
  ...repo,

  /** Every pioneer joke this person has already claimed for this generated lesson variant. */
  async findForStep(userId: string, stepId: string, userAgeGroup: UserAgeGroupDb, teachingMode: TeachingModeDb) {
    const { data, error } = await getSupabaseClient()
      .from("pioneer_easter_egg_claims")
      .select("*")
      .eq("user_id", userId)
      .eq("step_id", stepId)
      .eq("user_age_group", userAgeGroup)
      .eq("teaching_mode", teachingMode);
    if (error) throw error;
    return data;
  },

  /**
   * Claims one pioneer's joke reveal. A plain insert, not an upsert — the
   * unique key (step_id, user_age_group, teaching_mode, pioneer_id) makes a
   * second claim attempt a no-op conflict, which the caller treats as
   * "already claimed" rather than an error (see
   * app/actions/masterclassProgress.ts's claimPioneerEasterEggAction).
   */
  async claim(input: { userId: string; topicId: string; stepId: string; userAgeGroup: UserAgeGroupDb; teachingMode: TeachingModeDb; pioneerId: string }) {
    const { data, error } = await getSupabaseClient()
      .from("pioneer_easter_egg_claims")
      .upsert(
        {
          user_id: input.userId,
          topic_id: input.topicId,
          step_id: input.stepId,
          user_age_group: input.userAgeGroup,
          teaching_mode: input.teachingMode,
          pioneer_id: input.pioneerId,
        },
        { onConflict: "step_id,user_age_group,teaching_mode,pioneer_id", ignoreDuplicates: true }
      )
      .select("*");
    if (error) throw error;
    // ignoreDuplicates means a repeat claim returns an empty array, not an
    // error and not the existing row — the caller (submitCheckpointAnswerAction's
    // sibling, claimPioneerEasterEggAction) treats "no row back" as
    // "already claimed", the same outcome either way.
    return data?.[0] ?? null;
  },
};
