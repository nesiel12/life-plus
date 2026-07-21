import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import { joinContextSections } from "@/lib/context/formatContext";
import { buildIntelligenceSignals, filterSignalsByCategory, rankSignals, formatSignalsForPrompt } from "@/lib/intelligence/core";
import type { SignalCategory } from "@/lib/intelligence/core";
import { createRecommendationEvent } from "@/lib/intelligence/recommendations";
import { categoryLabel } from "@/store/useAtlasStore";

// Goal breakdown only needs to know about goal-behavior-relevant
// intelligence — scoping the categories it considers is a task-boundary
// decision (this route doesn't care about upcoming events or relationship
// signals), distinct from *ranking* within that scope, which the engine
// still owns entirely (docs/ATLAS_ARCHITECTURE_VISION.md §9).
const RELEVANT_CATEGORIES: SignalCategory[] = ["personalDNA", "personalPattern", "goal", "memory"];

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 breakdowns / 5 min

const breakdownRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(["faith", "family", "knowledge", "health", "career"]),
});

function genericMilestones(title: string): string[] {
  return [
    `להגדיר יעד שבועי ברור עבור "${title}"`,
    "לשריין זמן קבוע בלו״ז לעבודה על היעד",
    "לבדוק התקדמות באמצע הדרך ולהתאים אם צריך",
    "לסכם ולחגוג את ההשלמה",
  ];
}

function parseMilestoneLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[\d.\-•)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`goals:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, breakdownRequestSchema);
  if (parsed.error) return parsed.error;
  const { title, category } = parsed.data;

  const user = await getUserByEmail(session.user.email);

  // Goal breakdown records at "accepted", not "pending": the UI has no
  // review step — GoalsPanel applies the returned milestones to a new goal
  // immediately (docs/BACKLOG.md audit). Logging it as pending would create
  // an event nothing will ever transition out of.
  async function trackBreakdown(milestones: string[], usedAI: boolean) {
    if (!user) return;
    await createRecommendationEvent(user.id, {
      type: "goal_milestones",
      source: "goal_breakdown_route",
      payload: { title, category, milestones, usedAI },
      initialStatus: "accepted",
    }).catch((err) => {
      console.error("Failed to record recommendation event:", err);
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    const milestones = genericMilestones(title);
    await trackBreakdown(milestones, false);
    return NextResponse.json({ milestones });
  }

  try {
    const context = user ? await buildAtlasContext(user.id, { query: title }) : undefined;

    const baseSystem =
      "You break down personal goals into 4-6 concrete, actionable milestones. Respond only with a numbered list in Hebrew, one milestone per line, no extra commentary.";

    const signals = context ? filterSignalsByCategory(buildIntelligenceSignals(context), RELEVANT_CATEGORIES) : [];
    const formatted = formatSignalsForPrompt(rankSignals(signals));
    const contextBlock = formatted
      ? `What's relevant to how he actually completes goals, ranked by importance:\n${formatted}`
      : "";

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: joinContextSections([baseSystem, contextBlock]),
      prompt: `היעד: "${title}" (תחום: ${categoryLabel(category)}). פרק אותו לרשימת אבני דרך.`,
    });

    const parsedMilestones = parseMilestoneLines(text);
    const milestones = parsedMilestones.length > 0 ? parsedMilestones : genericMilestones(title);
    await trackBreakdown(milestones, parsedMilestones.length > 0);
    return NextResponse.json({ milestones });
  } catch {
    const milestones = genericMilestones(title);
    await trackBreakdown(milestones, false);
    return NextResponse.json({ milestones });
  }
}
