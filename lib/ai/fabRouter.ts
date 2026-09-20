import "server-only";
import { generateStructuredData } from "@/lib/ai";
import { AiQuotaExceededError } from "@/lib/ai/service";
import type { AiActor } from "@/lib/ai/quota";
import {
  AutoActionSchema,
  ConfirmActionSchema,
  FabModelOutputSchema,
  MIN_CONFIDENCE,
  isSosMessage,
  type AutoAction,
  type ConfirmAction,
  type FabHandoffReason,
  type FabIntent,
  type FabModelOutput,
} from "@/lib/ai/fabIntents";
import { EXPENSE_CATEGORIES } from "@/lib/finances/categories";
import type { CommandPromptContext } from "@/lib/commands/buildCommandPrompt";

// The FAB's fast path (docs/ATLAS_ARCHITECTURE_VISION.md §12, extended): one
// short model call that decides whether a typed or spoken line is a quick log
// — water, an expense, a task, a Torah thought, a family interaction — and
// pulls out its fields. Everything else is handed back untouched to the
// pipelines that already own it (/api/commands/interpret for calendar and
// goals, /api/chat for questions), so this module never grows a second,
// competing idea of what those do.
//
// Same division of labour as lib/ai/agentRouter.ts: the model classifies and
// extracts, and never states a fact. What the user is told afterwards is
// composed from the validated payload (describeFabAction), not from model text.
//
// This module decides; it does not write. The route records the pending
// recommendation for confirm-mode actions, and the client performs auto-mode
// writes through the same store actions every other surface uses, so each
// keeps its own undo.

export type FabDecision =
  | { kind: "sos" }
  | { kind: "auto"; action: AutoAction }
  | { kind: "confirm"; action: ConfirmAction }
  | { kind: "reply"; reply: string }
  | { kind: "handoff"; reason: FabHandoffReason };

const CATEGORY_LIST = EXPENSE_CATEGORIES.map((c) => `${c.key} (${c.label})`).join(", ");

export function buildFabSystemPrompt(clock?: CommandPromptContext): string {
  const now = clock
    ? `\nהזמן המקומי כרגע: ${clock.nowLocal} (${clock.todayLabel}). כל זמן יחסי — "מחר", "בעוד שעה", "ביום שלישי" — מחושב ביחס אליו.\n`
    : "";

  return `אתה המסווג המהיר של Life Plus. המשתמש כותב או מקליט שורה אחת קצרה, ואתה מחליט אם זו רשומה מהירה ומחלץ ממנה שדות. אתה לא עונה למשתמש ולא מנהל שיחה.
${now}
בחר intent אחד:
- LOG_WATER — שתה מים. מלא logWater.amountMl במ״ל: כוס = 250, בקבוק = 500, ליטר = 1000. בלי כמות מפורשת, כוס אחת = 250.
- LOG_EXPENSE — הוציא כסף על משהו שכבר קרה ("שילמתי 40 על קפה"). מלא logExpense: amount בשקלים (מספר בלבד), category אחת מהרשימה הסגורה: ${CATEGORY_LIST}, ו-title קצר ("קפה", "דלק"). אם לא נאמר סכום — זה לא LOG_EXPENSE.
- ADD_TASK — משהו שצריך לעשות ("תזכיר לי להתקשר לרופא"). מלא addTask.title. dueAt בפורמט "YYYY-MM-DDTHH:MM" לפי הזמן המקומי, ורק אם נאמר זמן. priority "high" רק אם נאמר במפורש שזה דחוף. אירוע בזמן מוגדר ביומן ("פגישה מחר ב-10") אינו ADD_TASK — זה GENERAL_QUERY.
- TORAH_INSIGHT — חידוש, רעיון או דבר תורה שהמשתמש למד או חשב עליו. מלא torahInsight: title קצר ו-content בניסוח המשתמש.
- CRM_INTERACTION — דיבר, נפגש או התקשר עם בן משפחה או חבר ("דיברתי עם אמא"). מלא crmInteraction.contactName בדיוק כפי שנאמר, ו-note רק אם נאמר משהו נוסף.
- GENERAL_QUERY — כל דבר אחר: שאלה, בקשה מורכבת, יומן, יעדים, שיחה, ובפרט כל הודעה שמבטאת מצוקה או קושי רגשי. אל תנסה לסווג הודעה כזו כרשומה.

confidence הוא הביטחון שלך, בין 0 ל-1, ש-intent והשדות נכונים ושלמים. הודעה עמומה או חסרה פרט חיוני — ביטחון נמוך, או GENERAL_QUERY. אל תמציא סכום, שם, כמות או זמן שלא נאמרו. מלא רק את האובייקט של ה-intent שבחרת.`;
}

// dueAt reaches us from a model that was asked for "YYYY-MM-DDTHH:MM" and
// will sometimes add seconds or a zone. Losing the whole task over that would
// be a worse outcome than losing its due time, so it is repaired when it is
// close and dropped when it is not.
export function normalizeDueAt(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(raw.trim());
  if (!match) return undefined;
  return match[2] ? `${match[1]}T${match[2]}` : match[1];
}

export type ModelDecision =
  | { kind: "auto"; action: AutoAction }
  | { kind: "confirm"; action: Extract<ConfirmAction, { intent: "TORAH_INSIGHT" }> }
  | { kind: "crm"; contactName: string; note?: string; confidence: number }
  | { kind: "handoff"; reason: FabHandoffReason };

/**
 * The gate between what the model said and what the app is willing to do.
 * Pure: every "never write on a guess" rule lives here so it can be tested
 * without a model. Anything doubtful — a general request, thin confidence, a
 * payload that fails the strict schema — becomes a handoff to the existing
 * pipeline, never a partial write.
 */
export function decideFromModelOutput(output: FabModelOutput): ModelDecision {
  const intent: FabIntent = output.intent;
  if (intent === "GENERAL_QUERY") return { kind: "handoff", reason: "general" };
  if (output.confidence < MIN_CONFIDENCE[intent]) return { kind: "handoff", reason: "low_confidence" };

  const invalid = { kind: "handoff", reason: "invalid_payload" } as const;

  switch (intent) {
    case "LOG_WATER": {
      const parsed = AutoActionSchema.safeParse({
        intent,
        payload: output.logWater,
        confidence: output.confidence,
      });
      return parsed.success ? { kind: "auto", action: parsed.data } : invalid;
    }
    case "LOG_EXPENSE": {
      const payload = output.logExpense && {
        ...output.logExpense,
        amount: Math.round(output.logExpense.amount * 100) / 100,
      };
      const parsed = AutoActionSchema.safeParse({ intent, payload, confidence: output.confidence });
      return parsed.success ? { kind: "auto", action: parsed.data } : invalid;
    }
    case "ADD_TASK": {
      const payload = output.addTask && {
        title: output.addTask.title,
        dueAt: normalizeDueAt(output.addTask.dueAt),
        priority: output.addTask.priority ?? "normal",
      };
      const parsed = AutoActionSchema.safeParse({ intent, payload, confidence: output.confidence });
      return parsed.success ? { kind: "auto", action: parsed.data } : invalid;
    }
    case "TORAH_INSIGHT": {
      const parsed = ConfirmActionSchema.safeParse({
        intent,
        payload: output.torahInsight,
        confidence: output.confidence,
      });
      return parsed.success && parsed.data.intent === "TORAH_INSIGHT"
        ? { kind: "confirm", action: parsed.data }
        : invalid;
    }
    case "CRM_INTERACTION": {
      if (!output.crmInteraction) return invalid;
      return {
        kind: "crm",
        contactName: output.crmInteraction.contactName,
        note: output.crmInteraction.note || undefined,
        confidence: output.confidence,
      };
    }
  }
}

export interface FabRouterInput {
  text: string;
  actor: AiActor;
  clock?: CommandPromptContext;
  /**
   * Resolves a spoken name to a real contact, or null. Injected so this module
   * stays DB-free; the route supplies the user-scoped lookup. Never guesses or
   * creates a person (lib/commands/resolvePerson.ts).
   */
  findPerson: (spokenName: string) => Promise<{ id: string; name: string } | null>;
}

export async function routeFabInput(input: FabRouterInput): Promise<FabDecision> {
  // First, before anything that could spend quota, reach a model, or be logged.
  if (isSosMessage(input.text)) return { kind: "sos" };

  let output: FabModelOutput;
  try {
    output = await generateStructuredData({
      actor: input.actor,
      schema: FabModelOutputSchema,
      system: buildFabSystemPrompt(input.clock),
      prompt: input.text,
    });
  } catch (err) {
    // An exhausted allowance is a distinct, expected state the caller reports
    // as such (lib/api/aiErrorResponse.ts) — not "the AI hiccuped".
    if (err instanceof AiQuotaExceededError) throw err;
    return { kind: "handoff", reason: "unavailable" };
  }

  const decision = decideFromModelOutput(output);
  if (decision.kind === "auto" || decision.kind === "confirm" || decision.kind === "handoff") return decision;

  const person = await input.findPerson(decision.contactName);
  if (!person) {
    return {
      kind: "reply",
      reply: `לא מצאתי איש קשר בשם "${decision.contactName}" — אפשר להוסיף אותו קודם בלוח המשפחתי.`,
    };
  }

  const parsed = ConfirmActionSchema.safeParse({
    intent: "CRM_INTERACTION",
    payload: { personId: person.id, personName: person.name, note: decision.note },
    confidence: decision.confidence,
  });
  return parsed.success ? { kind: "confirm", action: parsed.data } : { kind: "handoff", reason: "invalid_payload" };
}
