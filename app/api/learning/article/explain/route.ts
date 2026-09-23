import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateChatText, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { ArticleExplainRequestSchema } from "@/lib/validations/learning";

export const runtime = "nodejs";

// A single short prose explanation, not a heavy generation — closer to a
// chat turn than the extract route's page-fetch-plus-structured-pick, so a
// tighter, chat-weight rate limit than that route's.
const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

const EXPLAIN_FAILED = "לא הצלחנו להסביר את הקטע הזה כרגע";

export interface ArticleExplainResponse {
  explanation: string;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`article-explain:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, ArticleExplainRequestSchema);
  if (parsed.error) return parsed.error;
  const { paragraph } = parsed.data;

  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "AI provider not configured" }, { status: 503 });
  }

  try {
    const actor = await currentUserActor();
    const explanation = await generateChatText({
      actor,
      operation: "chat",
      system:
        "אתה עוזר קריאה שמסביר קטע מכתבה בשפה פשוטה וברורה, בעברית, במשפט או שניים בלבד. אל תחזור על הקטע המקורי, רק הסבר אותו.",
      prompt: paragraph,
    });
    return NextResponse.json({ explanation: explanation.trim() } satisfies ArticleExplainResponse);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("[learning/article/explain] failed:", err);
    return NextResponse.json({ error: EXPLAIN_FAILED }, { status: 502 });
  }
}
