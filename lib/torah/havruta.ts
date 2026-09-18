// The AI חברותא — prompts and the deterministic shaping around them.
//
// Pure and client-safe: no database, no model call. The route
// (app/api/torah/havruta/[id]/messages) gathers the subject, calls the model
// through lib/ai/service.ts, and verifies citations; everything that decides
// *what the model is asked* and *how its answer is shaped* lives here, where
// it can be tested against plain objects.
//
// All model-facing text is Hebrew at the source (see docs/TORAH_KG_PLAN.md,
// "The native-Hebrew rule"): the prompt never contains English, so the answer
// can never be a translation.

import { normalizeHebrewPunctuation, stripForeignScript } from "@/lib/torah/hebrew";

export type HavrutaMode = "debate" | "clarify" | "contradiction";
export type HavrutaSubjectType = "summary" | "lesson" | "book" | "rabbi" | "concept" | "contradiction";

/**
 * What the assistant's turn was doing — shown as a badge, so the learner sees
 * at a glance whether they were just challenged or just backed up.
 */
export type HavrutaMove = "kushya" | "shita" | "chizuk" | "birur" | "teirutz";

export const HAVRUTA_MOVE_LABELS: Record<HavrutaMove, string> = {
  kushya: "קושיא",
  shita: "שיטה חולקת",
  chizuk: "חיזוק",
  birur: "בירור",
  teirutz: "תירוץ",
};

export const HAVRUTA_MODE_LABELS: Record<HavrutaMode, string> = {
  debate: "פלפול",
  clarify: "בחן את הבנתי",
  contradiction: "יישוב סתירה",
};

export type HavrutaInsightKind = "chiddush" | "kushya" | "resolution";

export const HAVRUTA_INSIGHT_LABELS: Record<HavrutaInsightKind, string> = {
  chiddush: "חידוש",
  kushya: "קושיא פתוחה",
  resolution: "יישוב",
};

export interface HavrutaInsight {
  text: string;
  kind: HavrutaInsightKind;
}

export interface HavrutaTurn {
  role: "user" | "assistant";
  content: string;
}

/** Everything the model is told about what is being discussed. */
export interface HavrutaSubject {
  type: HavrutaSubjectType;
  /** "משנה ברורה", "שיעור: הלכות מוקצה", "הרב קוק". */
  title: string;
  /** A book's author, a lesson's speaker, a rabbi's era. */
  byline?: string;
  /** Background: a description, a lesson summary, a biography. */
  background?: string;
  /** Key points / key topics. */
  points?: string[];
  /** The learner's own notes on this subject — what they will be challenged on. */
  notes?: { title: string; text: string }[];
  /** Only for a contradiction thread: the two sides being reconciled. */
  contradiction?: {
    left: { label: string; excerpt: string };
    right: { label: string; excerpt: string };
    explanation: string;
  };
}

const SUBJECT_NOUN: Record<HavrutaSubjectType, string> = {
  summary: "הסיכום",
  lesson: "השיעור",
  book: "הספר",
  rabbi: "שיטתו ותורתו של",
  concept: "המושג",
  contradiction: "הסתירה",
};

/** Budget for the whole prompt body. A bounded prompt is a bounded bill. */
const MAX_BACKGROUND_CHARS = 1200;
const MAX_NOTE_CHARS = 700;
const MAX_NOTES = 5;
const MAX_POINTS = 8;

export const HISTORY_LIMITS = { maxTurns: 10, maxChars: 6000 } as const;

/**
 * The system prompt for one mode.
 *
 * A debate partner that agrees with everything is useless, and one that
 * argues with everything is exhausting, so the prompt asks for the chavruta
 * of the beit midrash: sharp, warm, one or two challenges at a time, always
 * handing the turn back with a question. It never rules practical halacha —
 * that is a rav's job, and saying so is part of being honest.
 */
export function havrutaSystemPrompt(mode: HavrutaMode, subject: HavrutaSubject): string {
  const subjectLine =
    subject.type === "rabbi"
      ? `הנושא: ${SUBJECT_NOUN.rabbi} ${subject.title}.`
      : `הנושא: ${SUBJECT_NOUN[subject.type]} "${subject.title}".`;

  const shared = [
    "אתה חברותא תלמיד חכם בבית המדרש — חריף, ישר ותומך. אתה לומד יחד עם הלומד, לא מרצה לו.",
    subjectLine,
    "כתוב אך ורק בעברית מקורית של בית המדרש. לעולם לא תרגום, ולעולם לא מילים באנגלית.",
    "היה תמציתי: עד שלוש פסקאות קצרות. לכל היותר שתי קושיות או שיטות בכל תור, כדי שאפשר יהיה להתמודד איתן.",
    "סיים כל תור בשאלה אחת ברורה שמחזירה את הכדור ללומד.",
    "כשאתה מביא שיטה או מקור, כתוב מראה מקום מלא עם שם הספר (למשל: רמב״ם הלכות שבת פרק כ״ה הלכה א׳), כדי שיהיה אפשר לאמת אותו.",
    "לעולם אל תמציא מראה מקום, שיטה או ציטוט. אם אינך בטוח — אמור זאת, והשאר את רשימת המקורות ריקה.",
    "אל תפסוק הלכה למעשה. כשהשאלה נוגעת למעשה, הזכר בעדינות שיש לשאול רב.",
  ];

  const byMode: Record<HavrutaMode, string[]> = {
    debate: [
      "המצב: פלפול. תפקידך לאתגר את ההבנה של הלומד, לא לאשר אותה.",
      "הקשה קושיות הגיוניות על הסברא שלו, הבא שיטות חולקות מן הראשונים והאחרונים, וחפש את המקרה שבו הכלל שהוא אמר אינו עובד.",
      "כשהלומד צודק — אמור זאת בפשטות וחזק אותו במקור, ואז העמק צעד אחד הלאה. אל תתווכח רק לשם הוויכוח.",
    ],
    clarify: [
      "המצב: בחינת הבנה. שאל את הלומד שאלות שבודקות אם הבין את העיקר, את הטעם ואת הגדרים.",
      "כשהוא טועה — אל תיתן מיד את התשובה. הצבע על הנקודה, תן רמז, ותן לו לנסות שוב.",
      "כשהוא צודק — אשר בקצרה ועבור לשאלה עמוקה יותר.",
    ],
    contradiction: [
      "המצב: יישוב סתירה. בסיכומים של הלומד נמצאו שני דברים שנראים סותרים.",
      "בחן יחד איתו את דרכי היישוב של בית המדרש: חילוק בין המקרים, שתי שיטות חולקות (מחלוקת), לכתחילה ובדיעבד, או טעות באחד הסיכומים.",
      "עזור לו להגיע למסקנה משלו — מה מיישב את הסתירה, או איזה סיכום צריך לתקן. אל תכריע במקומו.",
    ],
  };

  return [...shared, ...byMode[mode]].join("\n");
}

/**
 * The prompt body: the subject, the learner's notes, the recent thread, and
 * the new message.
 *
 * History is trimmed from the oldest end — the model needs the current line
 * of argument, not the opening pleasantries.
 */
export function havrutaPrompt(params: {
  subject: HavrutaSubject;
  history: HavrutaTurn[];
  message: string;
}): string {
  const { subject } = params;
  const parts: string[] = [];

  if (subject.byline) parts.push(`${subject.title} — ${subject.byline}`);
  if (subject.background) parts.push(`רקע: ${clip(subject.background, MAX_BACKGROUND_CHARS)}`);
  if (subject.points?.length) {
    parts.push(`נקודות מרכזיות:\n${subject.points.slice(0, MAX_POINTS).map((p) => `• ${clip(p, 240)}`).join("\n")}`);
  }
  if (subject.contradiction) {
    const { left, right, explanation } = subject.contradiction;
    parts.push(
      [
        "הסתירה שנמצאה:",
        `בצד אחד — ${left.label}: "${clip(left.excerpt, MAX_NOTE_CHARS)}"`,
        `ובצד שני — ${right.label}: "${clip(right.excerpt, MAX_NOTE_CHARS)}"`,
        `מה נראה סותר: ${clip(explanation, 400)}`,
      ].join("\n")
    );
  }
  if (subject.notes?.length) {
    parts.push(
      `מה שהלומד כתב בסיכומיו:\n${subject.notes
        .slice(0, MAX_NOTES)
        .map((n) => `• ${n.title}: ${clip(n.text, MAX_NOTE_CHARS)}`)
        .join("\n")}`
    );
  }

  const history = trimHistory(params.history);
  if (history.length) {
    parts.push(
      `הדיון עד כה:\n${history.map((t) => `${t.role === "user" ? "הלומד" : "החברותא"}: ${t.content}`).join("\n")}`
    );
  }

  parts.push(`הלומד אומר עכשיו: ${params.message.trim()}`);
  return parts.join("\n\n");
}

/** The most recent turns that fit both limits, oldest first. */
export function trimHistory(
  turns: HavrutaTurn[],
  limits: { maxTurns: number; maxChars: number } = HISTORY_LIMITS
): HavrutaTurn[] {
  const kept: HavrutaTurn[] = [];
  let chars = 0;
  for (let i = turns.length - 1; i >= 0 && kept.length < limits.maxTurns; i--) {
    const content = turns[i].content.trim();
    if (!content) continue;
    if (chars + content.length > limits.maxChars) break;
    chars += content.length;
    kept.push({ role: turns[i].role, content });
  }
  return kept.reverse();
}

/** Opening moves offered before the first message, by mode. */
export function havrutaOpeners(mode: HavrutaMode, subjectType: HavrutaSubjectType): string[] {
  if (mode === "contradiction") {
    return ["אולי יש כאן חילוק בין המקרים?", "אולי אלו שתי שיטות חולקות?", "איזה מהסיכומים מדויק יותר?"];
  }
  if (mode === "clarify") {
    return ["בחן אותי על העיקר", "שאל אותי על הטעם", "תן לי מקרה מעשי לפתור"];
  }
  const subjectOpeners: Partial<Record<HavrutaSubjectType, string>> = {
    book: "מה הקושיא החזקה ביותר על שיטת הספר?",
    lesson: "הקשה על הרעיון המרכזי של השיעור",
    rabbi: "מי חלק על שיטתו, ומה הסברא?",
    concept: "מה הגדר המדויק של המושג הזה?",
    summary: "הקשה על מה שכתבתי",
  };
  return [subjectOpeners[subjectType] ?? "הקשה עליי", "הבא שיטה חולקת מן הראשונים", "איפה ההבנה שלי חלשה?"];
}

/** A thread's default title. */
export function havrutaThreadTitle(mode: HavrutaMode, subjectTitle: string): string {
  return `${HAVRUTA_MODE_LABELS[mode]} · ${subjectTitle}`.slice(0, 160);
}

const MOVES = new Set<HavrutaMove>(["kushya", "shita", "chizuk", "birur", "teirutz"]);

/** The model's move labels, cleaned: known values only, no repeats, at most three. */
export function normalizeMoves(raw: readonly string[] | undefined): HavrutaMove[] {
  const seen = new Set<HavrutaMove>();
  for (const value of raw ?? []) {
    if (MOVES.has(value as HavrutaMove)) seen.add(value as HavrutaMove);
    if (seen.size === 3) break;
  }
  return [...seen];
}

/** Hebrew-cleans a model reply: foreign-script drift out, punctuation normalised. */
export function cleanReply(text: string): string {
  return normalizeHebrewPunctuation(stripForeignScript(text)).replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// Insights — "מה יצא לנו מהדיון", printed on the Shabbat sheet
// ---------------------------------------------------------------------------

export function insightsSystemPrompt(): string {
  return [
    "אתה מסכם דיון חברותא בבית המדרש.",
    "כתוב אך ורק בעברית מקורית, במשפט אחד או שניים לכל תובנה.",
    "הוצא רק מה שבאמת עלה בדיון: חידוש שהתחדש, קושיא שנשארה פתוחה, או יישוב שהתקבל.",
    "אל תוסיף דברים שלא נאמרו, ואל תכתוב תובנה כללית שאינה קשורה לדיון.",
  ].join("\n");
}

export function insightsPrompt(subjectTitle: string, turns: HavrutaTurn[]): string {
  const history = trimHistory(turns, { maxTurns: 24, maxChars: 9000 });
  return [
    `הנושא: ${subjectTitle}`,
    `הדיון:\n${history.map((t) => `${t.role === "user" ? "הלומד" : "החברותא"}: ${t.content}`).join("\n")}`,
  ].join("\n\n");
}

const INSIGHT_KINDS = new Set<HavrutaInsightKind>(["chiddush", "kushya", "resolution"]);

/** At most four insights, Hebrew only, deduplicated. */
export function normalizeInsights(raw: readonly { text: string; kind: string }[] | undefined): HavrutaInsight[] {
  const seen = new Set<string>();
  const out: HavrutaInsight[] = [];
  for (const item of raw ?? []) {
    const text = cleanReply(item.text ?? "");
    if (text.length < 8) continue;
    const key = text.replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: clip(text, 400), kind: INSIGHT_KINDS.has(item.kind as HavrutaInsightKind) ? (item.kind as HavrutaInsightKind) : "chiddush" });
    if (out.length === 4) break;
  }
  return out;
}

/** Reads a stored insights jsonb defensively — it is data from a previous version too. */
export function parseStoredInsights(value: unknown): HavrutaInsight[] {
  if (!Array.isArray(value)) return [];
  return normalizeInsights(
    value.filter((v): v is { text: string; kind: string } => Boolean(v) && typeof (v as { text?: unknown }).text === "string")
  );
}

/** Cuts at a word boundary with an ellipsis, so a clipped note never ends mid-word. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}
