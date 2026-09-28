"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { getMomentumDashboard } from "@/lib/gamification/statsService";
import type { MomentumDashboardData } from "@/types/gamification";

export async function getMomentumDashboardAction(): Promise<MomentumDashboardData> {
  const userId = await getCurrentUserId();
  return getMomentumDashboard(userId);
}
