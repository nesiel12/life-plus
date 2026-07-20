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
import { formatContextSection, joinContextSections } from "@/lib/context/formatContext";
import { categoryLabel } from "@/store/useAtlasStore";

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

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ milestones: genericMilestones(title) });
  }

  try {
    const user = await getUserByEmail(session.user.email);
    const context = user ? await buildAtlasContext(user.id, { query: title }) : undefined;

    const baseSystem =
      "You break down personal goals into 4-6 concrete, actionable milestones. Respond only with a numbered list in Hebrew, one milestone per line, no extra commentary.";
    const dnaNote = context?.personalDNA?.learning_style
      ? `Tailor the milestones to his preferred learning style: ${context.personalDNA.learning_style}.`
      : "";
    const contextBlock = context
      ? joinContextSections([
          formatContextSection(
            "Known patterns in how he actually completes goals — shape milestone count/size accordingly",
            context.personalPatterns
          ),
          formatContextSection("His other active goals — avoid redundant milestones", context.activeGoals),
          formatContextSection("Related things he's shared before", context.relevantMemory),
        ])
      : "";

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: joinContextSections([baseSystem, dnaNote, contextBlock]),
      prompt: `היעד: "${title}" (תחום: ${categoryLabel(category)}). פרק אותו לרשימת אבני דרך.`,
    });

    const milestones = parseMilestoneLines(text);
    return NextResponse.json({ milestones: milestones.length > 0 ? milestones : genericMilestones(title) });
  } catch {
    return NextResponse.json({ milestones: genericMilestones(title) });
  }
}
