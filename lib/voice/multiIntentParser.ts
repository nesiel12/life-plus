import { z } from "zod";
import { EXPENSE_KEYS, categoryLabelFor, type ExpenseCategoryKey } from "@/lib/finances/categories";

// עוזר קולי's vocabulary — deliberately separate from lib/ai/fabIntents.ts
// rather than an extension of it. The FAB classifies one short line into ONE
// of a handful of intents; the Assistant decomposes one stream-of-
// consciousness utterance into SEVERAL simultaneous intents across
// modules ("למדתי פרק, הוצאתי 50 שקל, ותזכיר לי..."). Sharing a single
// {intent, payload} shape between "exactly one" and "zero or more, in
// parallel" would force one of the two call sites to bend around the other's
// assumptions (the FAB's EXECUTION_MODE/MIN_CONFIDENCE tables are keyed by a
// single decision, not a batch). What genuinely is shared — the expense
// category vocabulary and the quota/actor/rate-limit plumbing — is imported,
// not re-typed. lib/ai/fabRouter.ts is "server-only", so its normalizeDueAt
// is NOT imported here even though the logic is near-identical: this module
// must stay importable from the client (hooks/useVoiceAssistant.ts needs the
// same result types and describeVoiceAction() to render the breakdown before
// anything is written), and "server-only" poisons every module that imports
// it, client or not.

export const VOICE_INTENT_TYPES = ["TASK_CREATE", "EXPENSE_LOG", "LEARNING_PROGRESS", "FAMILY_NOTE", "NOTE_CAPTURE"] as const;
export type VoiceIntentType = (typeof VOICE_INTENT_TYPES)[number];

// --- Payloads the model fills in ------------------------------------------

const DUE_AT_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

export const taskCreateModelPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** "YYYY-MM-DDTHH:MM" in the user's local wall clock, or a bare date. */
  dueAt: z.string().regex(DUE_AT_PATTERN).optional(),
  priority: z.enum(["normal", "high"]).optional(),
  /** A name as spoken ("אבא", "רותי") — resolving it to a real contact is the route's job. */
  contactName: z.string().trim().min(1).max(80).optional(),
});

const expenseCategoryEnum = z.enum(EXPENSE_KEYS as unknown as [ExpenseCategoryKey, ...ExpenseCategoryKey[]]);

export const expenseLogModelPayloadSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  category: expenseCategoryEnum,
  description: z.string().trim().min(1).max(80),
});

export const learningProgressModelPayloadSchema = z.object({
  /** What the user called the topic ("פיזיקה") — resolving it to a real topic is the route's job. */
  topicQuery: z.string().trim().min(1).max(120),
  milestoneTitle: z.string().trim().max(120).optional(),
  note: z.string().trim().max(300).optional(),
});

export const familyNoteModelPayloadSchema = z.object({
  contactName: z.string().trim().min(1).max(80),
  noteText: z.string().trim().min(1).max(500),
  actionRequired: z.boolean().optional(),
});

export const noteCaptureModelPayloadSchema = z.object({
  title: z.string().trim().min(1).max(100),
  content: z.string().trim().min(1).max(2000),
  tags: z.array(z.string().trim().min(1).max(24)).max(6).optional(),
});

// Flat, one optional object per intent — same reasoning as
// lib/ai/fabIntents.ts's FabModelOutputSchema: anyOf/oneOf structured-output
// schemas are the part providers implement least evenly, so the model always
// returns the same object shape and only the populated field varies by intent.
export const VoiceModelItemSchema = z.object({
  intent: z.enum(VOICE_INTENT_TYPES),
  confidence: z.number().min(0).max(1),
  taskCreate: taskCreateModelPayloadSchema.optional(),
  expenseLog: expenseLogModelPayloadSchema.optional(),
  learningProgress: learningProgressModelPayloadSchema.optional(),
  familyNote: familyNoteModelPayloadSchema.optional(),
  noteCapture: noteCaptureModelPayloadSchema.optional(),
});
export type VoiceModelItem = z.infer<typeof VoiceModelItemSchema>;

// A stream-of-consciousness sentence rarely holds more than three or four
// distinct actions; capping the array keeps one long ramble from turning into
// a wall of Bento chips (and bounds the model's own output length).
export const VoiceModelOutputSchema = z.object({
  items: z.array(VoiceModelItemSchema).max(8),
});
export type VoiceModelOutput = z.infer<typeof VoiceModelOutputSchema>;

// --- Below this the model's own certainty is not enough to act on ---------
export const MIN_CONFIDENCE: Record<VoiceIntentType, number> = {
  TASK_CREATE: 0.6,
  EXPENSE_LOG: 0.75,
  LEARNING_PROGRESS: 0.55,
  FAMILY_NOTE: 0.6,
  NOTE_CAPTURE: 0.5,
};

// dueAt reaches us from a model that was asked for "YYYY-MM-DDTHH:MM" and
// will sometimes add seconds or a zone. Losing the whole task over that would
// be a worse outcome than losing its due time, so it is repaired when it is
// close and dropped when it is not. (Deliberately duplicated from
// lib/ai/fabRouter.ts's identical helper — see the file header for why.)
export function normalizeDueAt(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(raw.trim());
  if (!match) return undefined;
  return match[2] ? `${match[1]}T${match[2]}` : match[1];
}

// --- Validated, DB-free payloads --------------------------------------------

export interface TaskCreatePayload {
  title: string;
  dueAt?: string;
  priority: "normal" | "high";
  contactName?: string;
}

export interface ExpenseLogPayload {
  amount: number;
  category: ExpenseCategoryKey;
  title: string;
}

export interface NoteCapturePayload {
  title: string;
  content: string;
  tags: string[];
}

/** Still holds a spoken topic name — LEARNING_PROGRESS needs a DB lookup before it is a real action. */
export interface LearningProgressRawPayload {
  topicQuery: string;
  milestoneTitle?: string;
  note?: string;
}

/** Still holds a spoken contact name — FAMILY_NOTE needs a DB lookup before it is a real action. */
export interface FamilyNoteRawPayload {
  contactName: string;
  noteText: string;
}

export type VoiceValidatedItem =
  | { intent: "TASK_CREATE"; confidence: number; payload: TaskCreatePayload }
  | { intent: "EXPENSE_LOG"; confidence: number; payload: ExpenseLogPayload }
  | { intent: "LEARNING_PROGRESS"; confidence: number; payload: LearningProgressRawPayload }
  | { intent: "FAMILY_NOTE"; confidence: number; payload: FamilyNoteRawPayload }
  | { intent: "NOTE_CAPTURE"; confidence: number; payload: NoteCapturePayload };

/**
 * Normalizes and confidence-gates one raw model item. Pure, no DB — the two
 * intents that name a person or a topic are resolved against the real data
 * afterward (app/api/voice/parse/route.ts), the same "classify first, look up
 * second, never let the model assert an ID" division lib/ai/fabRouter.ts uses
 * for CRM_INTERACTION. Returns null for anything below its intent's
 * confidence floor, or whose own required object is missing (the model chose
 * an intent but didn't actually fill in its fields).
 */
export function validateVoiceItem(item: VoiceModelItem): VoiceValidatedItem | null {
  if (item.confidence < MIN_CONFIDENCE[item.intent]) return null;
  const { intent, confidence } = item;

  switch (intent) {
    case "TASK_CREATE": {
      if (!item.taskCreate) return null;
      const payload: TaskCreatePayload = {
        title: item.taskCreate.title,
        dueAt: normalizeDueAt(item.taskCreate.dueAt),
        priority: item.taskCreate.priority ?? "normal",
        contactName: item.taskCreate.contactName,
      };
      return { intent, confidence, payload };
    }
    case "EXPENSE_LOG": {
      if (!item.expenseLog) return null;
      const payload: ExpenseLogPayload = {
        amount: Math.round(item.expenseLog.amount * 100) / 100,
        category: item.expenseLog.category,
        title: item.expenseLog.description,
      };
      return { intent, confidence, payload };
    }
    case "LEARNING_PROGRESS":
      return item.learningProgress ? { intent, confidence, payload: item.learningProgress } : null;
    case "FAMILY_NOTE":
      return item.familyNote
        ? { intent, confidence, payload: { contactName: item.familyNote.contactName, noteText: item.familyNote.noteText } }
        : null;
    case "NOTE_CAPTURE": {
      if (!item.noteCapture) return null;
      const payload: NoteCapturePayload = {
        title: item.noteCapture.title,
        content: item.noteCapture.content,
        tags: item.noteCapture.tags ?? [],
      };
      return { intent, confidence, payload };
    }
  }
}

// --- What the route sends back: one entry per item the model produced -----

export interface ResolvedLearningProgress {
  topicId: string;
  topicTitle: string;
  resourceId: string | null;
  resourceTitle: string | null;
  note?: string;
}

export interface ResolvedFamilyNote {
  personId: string;
  personName: string;
  noteText: string;
}

export type VoiceRoutedAction =
  | { intent: "TASK_CREATE"; confidence: number; payload: TaskCreatePayload }
  | { intent: "EXPENSE_LOG"; confidence: number; payload: ExpenseLogPayload }
  | { intent: "LEARNING_PROGRESS"; confidence: number; payload: ResolvedLearningProgress }
  | { intent: "FAMILY_NOTE"; confidence: number; payload: ResolvedFamilyNote }
  | { intent: "NOTE_CAPTURE"; confidence: number; payload: NoteCapturePayload };

/** A fragment the model produced that could not become a real action — shown so the user knows it was heard, instead of silently vanishing. */
export interface VoiceUnresolvedItem {
  intent: VoiceIntentType;
  /** Short, human reason: contact/topic not found, etc. */
  reason: string;
  /** What to show for the fragment, when there's something worth showing ("פיזיקה", "אבא"). */
  label?: string;
}

export interface VoiceParseResult {
  routed: VoiceRoutedAction[];
  unresolved: VoiceUnresolvedItem[];
}

// --- Module presentation (color-coded Bento chips) --------------------------
// Reuses the app's existing per-life-area accent tokens (app/globals.css)
// rather than inventing a new palette — a chip reads as "this is a task" the
// same way GoalTaskLink's own task button already does (--accent-time), not
// through a second, competing color system.

export const VOICE_MODULE_META: Record<VoiceIntentType, { label: string; colorVar: string }> = {
  TASK_CREATE: { label: "משימה", colorVar: "--accent-time" },
  EXPENSE_LOG: { label: "כספים", colorVar: "--accent-finance" },
  LEARNING_PROGRESS: { label: "למידה", colorVar: "--accent-learning" },
  FAMILY_NOTE: { label: "משפחה", colorVar: "--accent-family" },
  NOTE_CAPTURE: { label: "פתק", colorVar: "--accent-knowledge" },
};

/** A one-line Hebrew summary of a routed action — never generated by the model, always composed from the validated payload, so it can never claim something that wasn't actually extracted. */
export function describeVoiceAction(action: VoiceRoutedAction): string {
  switch (action.intent) {
    case "TASK_CREATE": {
      const due = action.payload.dueAt ? ` · ${action.payload.dueAt.replace("T", " ")}` : "";
      const withContact = action.payload.contactName ? ` · עם ${action.payload.contactName}` : "";
      return `משימה: ${action.payload.title}${due}${withContact}${action.payload.priority === "high" ? " · דחוף" : ""}`;
    }
    case "EXPENSE_LOG":
      return `הוצאה: ${action.payload.title} · ${action.payload.amount} ₪ · ${categoryLabelFor(action.payload.category)}`;
    case "LEARNING_PROGRESS":
      return action.payload.resourceTitle
        ? `למידה: ${action.payload.topicTitle} — הושלם "${action.payload.resourceTitle}"`
        : `למידה: ${action.payload.topicTitle} — כל המשאבים כבר הושלמו`;
    case "FAMILY_NOTE":
      return `תיעוד שיחה עם ${action.payload.personName}`;
    case "NOTE_CAPTURE":
      return `פתק: ${action.payload.title}`;
  }
}
