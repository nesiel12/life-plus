import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { categoryLabel } from "@/store/useAtlasStore";
import type { LifeAreaKey } from "@/types";

export const runtime = "nodejs";

interface BreakdownRequestBody {
  title: string;
  category: LifeAreaKey;
}

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
  const { title, category } = (await request.json()) as BreakdownRequestBody;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ milestones: genericMilestones(title) });
  }

  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system:
        "You break down personal goals into 4-6 concrete, actionable milestones. Respond only with a numbered list in Hebrew, one milestone per line, no extra commentary.",
      prompt: `היעד: "${title}" (תחום: ${categoryLabel(category)}). פרק אותו לרשימת אבני דרך.`,
    });

    const milestones = parseMilestoneLines(text);
    return NextResponse.json({ milestones: milestones.length > 0 ? milestones : genericMilestones(title) });
  } catch {
    return NextResponse.json({ milestones: genericMilestones(title) });
  }
}
