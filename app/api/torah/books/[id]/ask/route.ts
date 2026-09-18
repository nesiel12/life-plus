import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { booksRepo } from "@/lib/db/books";
import { summariesRepo } from "@/lib/db/summaries";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { hebrewOnly, stripForeignScript } from "@/lib/torah/hebrew";
import { verifyCitation } from "@/lib/torah/verifyCitation";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };

const requestSchema = z.object({
  question: z.string().trim().min(2).max(500),
  // The last few turns, so "and what about the next siman?" has a referent.
  // Bounded — the client holds the thread, and an unbounded history is an
  // unbounded prompt.
  history: z
    .array(z.object({ question: z.string().max(500), answer: z.string().max(3000) }))
    .max(6)
    .optional(),
});

const answerSchema = z.object({
  answer: z.string().describe("התשובה בעברית, מבוססת על הספר. 2-6 משפטים."),
  citations: z
    .array(
      z.object({
        reference: z
          .string()
          .describe("מראה המקום בספר כפי שנכתב בספרות התורנית, כולל שם הספר (למשל: משנה ברורה סימן ר״ה ס״ק א)"),
        note: z.string().describe("שורה קצרה בעברית: מה נאמר שם"),
      })
    )
    .describe("עד 4 מקומות בספר שמבססים את התשובה. רשימה ריקה אם אין."),
  confident: z.boolean().describe("false אם התשובה מבוססת על ידע כללי ולא על הספר הזה עצמו"),
});

/**
 * The book-scoped AI assistant — "what does this sefer say about X?".
 *
 * STRUCTURED, NOT STREAMED. An answer is only as good as its sources, and a
 * source is only useful here if it is verified: each citation is resolved by
 * Sefaria's own reference parser (not the model), then its Hebrew text is
 * fetched so the panel shows what the sefer actually says. A citation that
 * does not resolve is still shown — marked unverified, as the model's words.
 *
 * Grounded in the user's own material too: their summaries filed on this book
 * go into the prompt, so the assistant can connect an answer to what the
 * user already learned.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`torah-book-ask:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const row = await booksRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "הספר לא נמצא." }, { status: 404 });

  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "אין מפתח AI מחובר, אז אי אפשר לשאול כרגע." }, { status: 200 });
  }

  const title = hebrewOnly(row.hebrew_title) ?? hebrewOnly(row.title) ?? row.title;
  const author = hebrewOnly(row.author);
  const topics = Array.isArray(row.key_topics) ? (row.key_topics as string[]).slice(0, 8) : [];

  const notes = (await summariesRepo.list(user.id).catch(() => []))
    .filter((s) => s.entity_type === "book" && s.entity_id === id && s.content?.trim())
    .slice(0, 5)
    .map((s) => `• ${s.title}: ${s.content.replace(/\s+/g, " ").slice(0, 400)}`);

  try {
    const actor = await currentUserActor();
    const object = await generateStructuredData({
      actor,
      schema: answerSchema,
      system: [
        `אתה חברותא ותלמיד חכם המומחה בספר "${title}"${author ? ` מאת ${author}` : ""}.`,
        "ענה אך ורק בעברית מקורית וטבעית, בלשון בית המדרש — לעולם לא בתרגום מאנגלית.",
        "ענה על הספר הזה. אם השאלה חורגת ממנו, אמור זאת בפשטות במקום לענות על משהו אחר.",
        "כתוב מראי מקומות כפי שהם מופיעים בספרות התורנית, וכלול בהם את שם הספר, כדי שניתן יהיה לאמת אותם.",
        "לעולם אל תמציא מראה מקום. אם אינך בטוח — השאר את רשימת המקורות ריקה וסמן confident=false.",
        "אם יש סיכומים של הלומד, קשר את תשובתך אליהם כשזה רלוונטי.",
      ].join("\n"),
      prompt: [
        row.description && hebrewOnly(row.description) ? `על הספר: ${row.description}` : null,
        topics.length ? `נושאים מרכזיים: ${topics.join(", ")}` : null,
        notes.length ? `הסיכומים של הלומד על הספר:\n${notes.join("\n")}` : null,
        ...(parsed.data.history ?? []).map((turn) => `שאלה קודמת: ${turn.question}\nתשובה: ${turn.answer}`),
        `שאלה: ${parsed.data.question}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    const citations = await Promise.all(object.citations.slice(0, 4).map((c) => verifyCitation(c, title)));

    return NextResponse.json({
      answer: stripForeignScript(object.answer),
      confident: object.confident,
      citations,
    });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "השאלה נכשלה. נסה שוב." }, { status: 200 });
  }
}
