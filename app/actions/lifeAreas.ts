"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { lifeAreaScoresRepo } from "@/lib/db/lifeAreaScores";
import { toLifeArea } from "@/lib/mappers";
import type { LifeAreaKey } from "@/types";

export async function updateLifeAreaScoreAction(key: LifeAreaKey, score: number) {
  const userId = await getCurrentUserId();
  const row = await lifeAreaScoresRepo.setScore(userId, key, score);
  return toLifeArea(row);
}
