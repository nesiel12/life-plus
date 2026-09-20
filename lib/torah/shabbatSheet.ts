// "הדפסה לשבת" — which of the week's learning goes on the printed sheet.
//
// Pure: the print route loads rows and hands them here; every choice about
// the week's boundaries, what counts as a highlight, the order, and how long
// each piece may run is made here and tested (shabbatSheet.test.ts).
//
// A sheet is a few printed pages read at the Shabbat table, not an export of
// the database — so everything is capped and clipped at a sentence.

import { HDate, Locale, Sedra } from "@hebcal/core";
import { clip } from "@/lib/torah/havruta";
import type { HavrutaInsight } from "@/lib/torah/havruta";
import type { PracticeQuestionKind } from "@/lib/torah/lessons/types";

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

export interface SheetWeek {
  /** Sunday 00:00 in the learner's zone, as an instant. */
  start: Date;
  /** The following Sunday 00:00 — exclusive. */
  end: Date;
  /** The Shabbat that closes this week, as YYYY-MM-DD. */
  shabbatDate: string;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdays.indexOf(get("weekday")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/** The instant of local midnight on a calendar date in a zone (DST-safe). */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  // Guess the UTC instant, measure how far the zone's clock is from it, correct
  // — twice, so a DST change between the guess and the answer converges.
  let guess = Date.UTC(year, month - 1, day);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess -= asUtc - Date.UTC(year, month - 1, day);
  }
  return new Date(guess);
}

/**
 * The learning week a sheet covers: Sunday through Shabbat.
 *
 * `weekOffset` 0 is the current week — the one whose Shabbat is coming (or is
 * today); -1 the week before. On Shabbat itself the current week is still the
 * one ending today, which is exactly the sheet someone prints on Friday.
 */
export function sheetWeek(now: Date, timeZone: string, weekOffset = 0): SheetWeek {
  const p = zonedParts(now, timeZone);
  const sundayUtc = new Date(Date.UTC(p.year, p.month - 1, p.day - p.weekday + weekOffset * 7));
  const nextSundayUtc = new Date(sundayUtc.getTime() + 7 * 86_400_000);
  const shabbatUtc = new Date(sundayUtc.getTime() + 6 * 86_400_000);
  return {
    start: zonedMidnight(sundayUtc.getUTCFullYear(), sundayUtc.getUTCMonth() + 1, sundayUtc.getUTCDate(), timeZone),
    end: zonedMidnight(nextSundayUtc.getUTCFullYear(), nextSundayUtc.getUTCMonth() + 1, nextSundayUtc.getUTCDate(), timeZone),
    shabbatDate: shabbatUtc.toISOString().slice(0, 10),
  };
}

const NIQQUD = /[֑-ׇ]/g;

function stripNiqqud(text: string): string {
  return text.replace(NIQQUD, "");
}

/**
 * "פרשת האזינו", or the festival when Shabbat is a chag ("שבת חול המועד סוכות").
 * Israel's reading schedule by default — it differs from the diaspora's in some years.
 */
export function parashaTitle(shabbatDate: string, israel = true): string {
  const [y, m, d] = shabbatDate.split("-").map(Number);
  const hd = new HDate(new Date(y, m - 1, d));
  const result = new Sedra(hd.getFullYear(), israel).lookup(hd);
  const names = result.parsha.map((name) => stripNiqqud(Locale.gettext(name, "he") ?? name));
  if (result.chag) return `שבת ${names.join(" ")}`;
  return `פרשת ${names.join("-")}`;
}

/** "כ״ט אלול – ה׳ תשרי תשפ״ז" for the week's Sunday..Shabbat. */
export function hebrewWeekRange(shabbatDate: string): string {
  const [y, m, d] = shabbatDate.split("-").map(Number);
  const shabbat = new HDate(new Date(y, m - 1, d));
  const sunday = shabbat.subtract(6, "d");
  const end = stripNiqqud(shabbat.renderGematriya(true));
  const startFull = stripNiqqud(sunday.renderGematriya(true));
  // Same Hebrew month and year: say them once, at the end.
  if (sunday.getMonth() === shabbat.getMonth() && sunday.getFullYear() === shabbat.getFullYear()) {
    return `${startFull.split(" ")[0]} – ${end}`;
  }
  if (sunday.getFullYear() === shabbat.getFullYear()) {
    return `${startFull.split(" ").slice(0, -1).join(" ")} – ${end}`;
  }
  return `${startFull} – ${end}`;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface SheetSummaryInput {
  id: string;
  title: string;
  content: string;
  isDraft?: boolean;
  /** "משנה ברורה" — what the note is filed under, when it is filed. */
  subject?: string;
  updatedAt: string;
}

export interface SheetLessonInput {
  id: string;
  title: string;
  summary: string | null;
  keyPoints: string[];
  speaker?: string | null;
  status: string;
  /** When processing finished — the lesson's "learned on". */
  processedAt: string | null;
}

export interface SheetThreadInput {
  id: string;
  title: string | null;
  insights: HavrutaInsight[];
  updatedAt: string;
}

export interface SheetQuestionInput {
  id: string;
  prompt: string;
  modelAnswer: string | null;
  kind: PracticeQuestionKind;
  lessonTitle?: string;
  createdAt: string;
}

export interface SheetCardInput {
  id: string;
  front: string;
  back: string;
  lapses: number;
  easeFactor: number;
  createdAt: string;
  lastReviewedAt: string | null;
  suspended?: boolean;
}

export interface SheetInput {
  now: Date;
  timeZone: string;
  weekOffset?: number;
  israel?: boolean;
  summaries: SheetSummaryInput[];
  lessons: SheetLessonInput[];
  threads: SheetThreadInput[];
  questions: SheetQuestionInput[];
  cards: SheetCardInput[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface ShabbatSheet {
  week: SheetWeek;
  parasha: string;
  hebrewRange: string;
  summaries: { id: string; title: string; subject?: string; body: string }[];
  lessons: { id: string; title: string; speaker?: string; summary?: string; keyPoints: string[] }[];
  insights: { threadId: string; title: string; items: HavrutaInsight[] }[];
  questions: { id: string; prompt: string; answer: string; source?: string }[];
  cards: { id: string; front: string; back: string }[];
  isEmpty: boolean;
}

export const SHEET_LIMITS = {
  summaries: 6,
  summaryChars: 900,
  lessons: 4,
  lessonSummaryChars: 600,
  keyPoints: 5,
  threads: 4,
  questions: 5,
  answerChars: 500,
  cards: 12,
} as const;

// A dilemma to argue over at the table beats a recall prompt.
const QUESTION_KIND_ORDER: Record<PracticeQuestionKind, number> = { dilemma: 0, counter: 1, scenario: 2, application: 3, compare: 4, recall: 5 };

function inWeek(iso: string | null | undefined, week: SheetWeek): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= week.start.getTime() && t < week.end.getTime();
}

/** Clips at the last sentence end that fits, falling back to a word boundary. */
export function clipAtSentence(text: string, max: number): string {
  const flat = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("׃"), cut.lastIndexOf("? "), cut.lastIndexOf("! "), cut.lastIndexOf("\n"));
  if (end > max * 0.5) return cut.slice(0, end + 1).trim();
  return clip(flat, max);
}

/** Assembles the sheet for one week. */
export function buildShabbatSheet(input: SheetInput): ShabbatSheet {
  const week = sheetWeek(input.now, input.timeZone, input.weekOffset ?? 0);
  const newestFirst = <T>(get: (item: T) => string | null) => (a: T, b: T) =>
    (get(b) ?? "").localeCompare(get(a) ?? "");

  const summaries = input.summaries
    .filter((s) => !s.isDraft && s.content.trim().length > 0 && inWeek(s.updatedAt, week))
    .sort(newestFirst((s) => s.updatedAt))
    .slice(0, SHEET_LIMITS.summaries)
    .map((s) => ({ id: s.id, title: s.title.trim() || "סיכום", subject: s.subject, body: clipAtSentence(s.content, SHEET_LIMITS.summaryChars) }));

  const lessons = input.lessons
    .filter((l) => l.status === "ready" && inWeek(l.processedAt, week))
    .sort(newestFirst((l) => l.processedAt))
    .slice(0, SHEET_LIMITS.lessons)
    .map((l) => ({
      id: l.id,
      title: l.title,
      speaker: l.speaker?.trim() || undefined,
      summary: l.summary ? clipAtSentence(l.summary, SHEET_LIMITS.lessonSummaryChars) : undefined,
      keyPoints: l.keyPoints.map((p) => p.trim()).filter(Boolean).slice(0, SHEET_LIMITS.keyPoints),
    }));

  const insights = input.threads
    .filter((t) => t.insights.length > 0 && inWeek(t.updatedAt, week))
    .sort(newestFirst((t) => t.updatedAt))
    .slice(0, SHEET_LIMITS.threads)
    .map((t) => ({ threadId: t.id, title: t.title?.trim() || "דיון בחברותא", items: t.insights }));

  // Hard questions first: a scenario to argue over at the table beats a recall prompt.
  const questions = input.questions
    .filter((q) => q.modelAnswer?.trim() && inWeek(q.createdAt, week))
    .sort((a, b) => QUESTION_KIND_ORDER[a.kind] - QUESTION_KIND_ORDER[b.kind] || b.createdAt.localeCompare(a.createdAt))
    .slice(0, SHEET_LIMITS.questions)
    .map((q) => ({ id: q.id, prompt: q.prompt.trim(), answer: clipAtSentence(q.modelAnswer ?? "", SHEET_LIMITS.answerChars), source: q.lessonTitle }));

  // Key cards: new this week, or reviewed this week and still slipping —
  // the ones worth one more look over Shabbat. Slipping cards lead.
  const cards = input.cards
    .filter((c) => !c.suspended && (inWeek(c.createdAt, week) || (inWeek(c.lastReviewedAt, week) && c.lapses > 0)))
    .sort((a, b) => b.lapses - a.lapses || a.easeFactor - b.easeFactor || b.createdAt.localeCompare(a.createdAt))
    .slice(0, SHEET_LIMITS.cards)
    .map((c) => ({ id: c.id, front: c.front.trim(), back: c.back.trim() }));

  return {
    week,
    parasha: parashaTitle(week.shabbatDate, input.israel ?? true),
    hebrewRange: hebrewWeekRange(week.shabbatDate),
    summaries,
    lessons,
    insights,
    questions,
    cards,
    isEmpty: summaries.length + lessons.length + insights.length + questions.length + cards.length === 0,
  };
}
