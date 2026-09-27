import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { goalsRepo } from "@/lib/db/goals";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import { joinContextSections } from "@/lib/context/formatContext";
import { buildIntelligenceSignals, filterSignalsByCategory, rankSignals, formatSignalsForPrompt } from "@/lib/intelligence/core";
import type { SignalCategory } from "@/lib/intelligence/core";
import { createRecommendationEvent } from "@/lib/intelligence/recommendations";
import { categoryLabel } from "@/store/useAtlasStore";
import { generateChatText, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// The Hero Focus Card's micro-steps: 2-3 concrete actions for the ONE
// milestone pickTopGoals already picked as the day's top priority. A sibling
// of app/api/goals/breakdown/route.ts (which turns a whole *new goal title*
// into 4-6 milestones) — same AI-calling shape, narrower job: this never
// creates anything, it just suggests how to start on a milestone that
// already exists.
//
// GET + query params, not POST: the client (HeroFocusCard, via useInsights)
// needs a plain URL to cache against, and re-deriving the real title/category
// server-side from the DB (rather than trusting client-sent text) matches
// every other route here that resolves state from the session, not the body.
const RELEVANT_CATEGORIES: SignalCategory[] = ["personalDNA", "personalPattern", "goal"];

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 requests / 5 min

function genericSteps(title: string): string[] {
  return [`להתחיל ב"${title}" היום, גם בצעד קטן`, "לשריין 20 דקות רצופות בלו״ז לשם כך", "לסמן כבוצע ברגע שמתקדמים"];
}

function parseStepLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[\d.\-•)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`next-steps:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const url = new URL(request.url);
  const goalId = url.searchParams.get("goalId");
  const milestoneId = url.searchParams.get("milestoneId");
  if (!goalId || !milestoneId) {
    return NextResponse.json({ steps: [] });
  }

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ steps: [] });
  }

  const goals = await goalsRepo.listWithMilestones(user.id);
  const goal = goals.find((g) => g.id === goalId);
  const milestone = goal?.milestones.find((m) => m.id === milestoneId);
  if (!goal || !milestone) {
    // Stale client state (the goal/milestone was deleted or completed since
    // pickTopGoals last ran client-side) — an honest empty result, not an error.
    return NextResponse.json({ steps: [] });
  }

  const actor = await currentUserActor();

  async function trackNextSteps(steps: string[], usedAI: boolean) {
    await createRecommendationEvent(user!.id, {
      type: "goal_next_steps",
      source: "goal_next_steps_route",
      payload: { goalId, milestoneId, steps, usedAI },
      // Same reasoning as goal_milestones (breakdown/route.ts): the Hero
      // just displays these, there's no accept/reject step to leave pending.
      initialStatus: "accepted",
    }).catch((err) => {
      console.error("Failed to record recommendation event:", err);
    });
  }

  if (!isProviderConfigured()) {
    const steps = genericSteps(milestone.title);
    await trackNextSteps(steps, false);
    return NextResponse.json({ steps });
  }

  try {
    const context = await buildAtlasContext(user.id, { query: milestone.title });
    const baseSystem =
      "You suggest concrete next actions for ONE specific milestone of a personal goal. Respond only with a numbered list of 2-3 short, immediately actionable steps in Hebrew, one per line, no extra commentary.";

    const signals = filterSignalsByCategory(buildIntelligenceSignals(context), RELEVANT_CATEGORIES);
    const formatted = formatSignalsForPrompt(rankSignals(signals));
    const contextBlock = formatted
      ? `What's relevant to how he actually gets things done, ranked by importance:\n${formatted}`
      : "";

    const text = await generateChatText({
      actor,
      system: joinContextSections([baseSystem, contextBlock]),
      prompt: `היעד: "${goal.title}" (תחום: ${categoryLabel(goal.category)}). הצעד הבא: "${milestone.title}". הצע 2-3 פעולות קונקרטיות להתחיל בהן.`,
    });

    const parsedSteps = parseStepLines(text);
    const steps = parsedSteps.length > 0 ? parsedSteps : genericSteps(milestone.title);
    await trackNextSteps(steps, parsedSteps.length > 0);
    return NextResponse.json({ steps });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    const steps = genericSteps(milestone.title);
    await trackNextSteps(steps, false);
    return NextResponse.json({ steps });
  }
}
