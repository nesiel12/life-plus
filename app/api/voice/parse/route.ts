import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/db/users";
import { peopleRepo } from "@/lib/db/people";
import { learningTopicsRepo, learningResourcesRepo } from "@/lib/db/learning";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { toLearningTopic, toLearningResource } from "@/lib/mappers";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { isSosMessage } from "@/lib/ai/fabIntents";
import { resolvePersonByName } from "@/lib/commands/resolvePerson";
import { EXPENSE_CATEGORIES } from "@/lib/finances/categories";
import { getLocalWallClock } from "@/lib/intelligence/personalDNA/timezone";
import { localDayIn, resolveUserTimezone } from "@/lib/proactive/timezone";
import { WEEKDAY_LABELS } from "@/lib/schedule/routine";
import {
  VoiceModelOutputSchema,
  validateVoiceItem,
  describeVoiceAction,
  type VoiceModelOutput,
  type VoiceRoutedAction,
  type VoiceUnresolvedItem,
} from "@/lib/voice/multiIntentParser";

export const runtime = "nodejs";
export const maxDuration = 30;

// A stream-of-consciousness ramble is naturally longer than a FAB one-liner
// (lib/api/fab has 30/5min), but this is still "decompose what I just said,"
// not a chat — capped closer to the FAB's own rate than to /api/chat's.
const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };

const voiceParseRequestSchema = z.object({
  // A final speech-recognition transcript or the text-fallback input — both
  // arrive as text; the mic never reaches the server, only what it heard.
  text: z.string().trim().min(1).max(2000),
});

const CATEGORY_LIST = EXPENSE_CATEGORIES.map((c) => `${c.key} (${c.label})`).join(", ");

function buildVoiceSystemPrompt(clock: { nowLocal: string; todayLabel: string }): string {
  return `אתה מנוע הניתוח הרב-כוונתי של Life Plus. המשתמש מדבר בזרם תודעה — משפט אחד עשוי להכיל כמה פעולות שונות לגמרי, במודולים שונים. המשימה שלך: לפרק את מה שנאמר לרשימת פעולות (items), אחת לכל כוונה נפרדת, ולחלץ את השדות שלה. אתה לא עונה למשתמש ולא מנהל שיחה — רק מפרק ומחלץ.

הזמן המקומי כרגע: ${clock.nowLocal} (${clock.todayLabel}). כל זמן יחסי — "מחר", "הערב", "בעוד שעה" — מחושב ביחס אליו.

לכל item בחר intent אחד:
- TASK_CREATE — תזכורת או משהו שצריך לעשות ("תזכיר לי להתקשר לרופא", "צריך לקנות מתנה"). מלא taskCreate.title. dueAt בפורמט "YYYY-MM-DDTHH:MM" לפי הזמן המקומי, ורק אם נאמר זמן (מילה כמו "הערב"/"מחר" בלי שעה מפורשת — קבע שעה סבירה, 20:00 לערב, 09:00 לבוקר). priority "high" רק אם נאמר במפורש שזה דחוף. contactName רק אם המשימה קשורה במפורש לבן אדם ("לדבר עם אבא").
- EXPENSE_LOG — הוצאה כספית שכבר קרתה ("הוצאתי 50 שקל על דלק"). מלא expenseLog: amount בשקלים (מספר בלבד), category אחת מהרשימה הסגורה: ${CATEGORY_LIST}, ו-description קצר. בלי סכום מפורש — זו לא EXPENSE_LOG.
- LEARNING_PROGRESS — התקדמות בלמידה של נושא קיים ("למדתי היום פרק על פיזיקה", "סיימתי את הפרק על..."). מלא learningProgress.topicQuery בדיוק כפי שהנושא נאמר (לא הכותרת המלאה בהכרח — רק המילה/הביטוי ששימש לזהות אותו, למשל "פיזיקה"). note אם נאמר פרט נוסף.
- FAMILY_NOTE — אינטראקציה עם בן משפחה או חבר שכבר קרתה ("דיברתי עם אמא", "נפגשתי עם רותי"). מלא familyNote.contactName בדיוק כפי שנאמר, ו-noteText בתמצית מה שנאמר על השיחה/המפגש.
- NOTE_CAPTURE — מחשבה, רעיון או פתק כללי שלא מתאים לאף אחד מהסוגים למעלה. מלא noteCapture: title קצר ו-content בניסוח המשתמש.

confidence הוא הביטחון שלך, בין 0 ל-1, ש-intent והשדות נכונים ושלמים. קטע עמום או חסר פרט חיוני — ביטחון נמוך, או השמט אותו מה-items. אל תמציא סכום, שם, כמות או זמן שלא נאמרו. מלא רק את האובייקט של ה-intent שבחרת בכל item. עד 8 items.`;
}

/** Fuzzy-matches a spoken topic name the same way resolvePersonByName matches a spoken contact name — both are "id + a couple of name-like fields", so the one matcher serves both without a second implementation. */
function resolveTopicByQuery<T extends { id: string; title: string }>(topics: T[], query: string): T | null {
  return resolvePersonByName(
    topics.map((t) => ({ id: t.id, name: t.title })),
    query
  ) as T | null;
}

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, voiceParseRequestSchema);
  if (parsed.error) return parsed.error;
  const { text } = parsed.data;

  // Same rule as every other free-text surface in the app (the FAB, chat,
  // the dashboard's UniversalInputBar): a distress message is caught before
  // the rate limiter, the database, the AI actor or a model ever see it, and
  // produces no log line. The client already checks this before the request
  // is even sent (hooks/useVoiceCompanion.ts) — this is the backstop.
  if (isSosMessage(text)) {
    return NextResponse.json({ mode: "sos" as const });
  }

  const limited = rateLimitResponse(`voice-parse:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  if (!isProviderConfigured()) {
    return NextResponse.json({ mode: "unavailable" as const });
  }

  const user = await getUserByEmail(token.email);
  if (!user) {
    return NextResponse.json({ error: "User record not found for authenticated session" }, { status: 500 });
  }

  const actor = await currentUserActor();

  try {
    const dna = await personalDnaRepo.get(user.id).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);
    const now = new Date();
    const clock = {
      nowLocal: getLocalWallClock(now.toISOString(), timeZone),
      todayLabel: WEEKDAY_LABELS[new Date(`${localDayIn(now, timeZone)}T12:00:00Z`).getUTCDay()],
    };

    const output: VoiceModelOutput = await generateStructuredData({
      actor,
      schema: VoiceModelOutputSchema,
      system: buildVoiceSystemPrompt(clock),
      prompt: text,
    });

    const routed: VoiceRoutedAction[] = [];
    const unresolved: VoiceUnresolvedItem[] = [];

    // Contact/topic lists are fetched at most once each, only if an item
    // actually needs them — most utterances touch neither.
    let people: Awaited<ReturnType<typeof peopleRepo.list>> | null = null;
    let topics: ReturnType<typeof toLearningTopic>[] | null = null;

    for (const rawItem of output.items) {
      const item = validateVoiceItem(rawItem);
      if (!item) continue;

      switch (item.intent) {
        case "TASK_CREATE":
        case "EXPENSE_LOG":
        case "NOTE_CAPTURE":
          routed.push(item as VoiceRoutedAction);
          break;

        case "LEARNING_PROGRESS": {
          topics ??= (await learningTopicsRepo.list(user.id)).map(toLearningTopic);
          const topic = resolveTopicByQuery(topics, item.payload.topicQuery);
          if (!topic) {
            unresolved.push({ intent: "LEARNING_PROGRESS", reason: "לא נמצא נושא מתאים", label: item.payload.topicQuery });
            break;
          }
          const resources = (await learningResourcesRepo.list(user.id)).map(toLearningResource).filter((r) => r.topicId === topic.id);
          const nextResource = resources.find((r) => !r.isCompleted) ?? null;
          routed.push({
            intent: "LEARNING_PROGRESS",
            confidence: item.confidence,
            payload: {
              topicId: topic.id,
              topicTitle: topic.title,
              resourceId: nextResource?.id ?? null,
              resourceTitle: nextResource?.title ?? null,
              note: item.payload.note,
            },
          });
          break;
        }

        case "FAMILY_NOTE": {
          people ??= await peopleRepo.list(user.id);
          const person = resolvePersonByName(
            people.map((p) => ({ id: p.id, name: p.name, hebrewName: p.hebrew_name ?? undefined })),
            item.payload.contactName
          );
          if (!person) {
            unresolved.push({ intent: "FAMILY_NOTE", reason: "לא נמצא איש קשר בשם זה", label: item.payload.contactName });
            break;
          }
          routed.push({
            intent: "FAMILY_NOTE",
            confidence: item.confidence,
            payload: { personId: person.id, personName: person.name, noteText: item.payload.noteText },
          });
          break;
        }
      }
    }

    return NextResponse.json({
      mode: "parsed" as const,
      actions: routed.map((action) => ({ ...action, summary: describeVoiceAction(action) })),
      unresolved,
    });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ mode: "unavailable" as const });
  }
}
