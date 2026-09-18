import "server-only";
import { booksRepo } from "@/lib/db/books";
import { conceptsRepo } from "@/lib/db/concepts";
import { contradictionAlertsRepo } from "@/lib/db/havruta";
import { lessonsRepo } from "@/lib/db/lessons";
import { rabbisRepo } from "@/lib/db/rabbis";
import { summariesRepo } from "@/lib/db/summaries";
import { hebrewOnly, lifespanLabel, eraLabel } from "@/lib/torah/hebrew";
import type { ContradictionSide } from "@/lib/torah/contradictions";
import type { HavrutaSubject, HavrutaSubjectType } from "@/lib/torah/havruta";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type SummaryRow = Tables["summaries"]["Row"];
type AlertRow = Tables["contradiction_alerts"]["Row"];

// Loading what a Havruta or the contradiction scanner talks about.
//
// The pure modules (lib/torah/havruta.ts, contradictions.ts) take plain
// objects; this is the one place those objects are assembled from rows, so
// the routes stay orchestration and the labels ("הסיכום שלך על משנה ברורה")
// are written once.

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
}

function notesOn(summaries: SummaryRow[], entityType: string, entityId: string) {
  return summaries
    .filter((s) => s.entity_type === entityType && s.entity_id === entityId && !s.is_draft && s.content.trim())
    .map((s) => ({ title: s.title, text: s.content }));
}

/** A subject for the Havruta, or null when it does not exist for this user. */
export async function loadHavrutaSubject(
  userId: string,
  type: HavrutaSubjectType,
  id: string
): Promise<HavrutaSubject | null> {
  switch (type) {
    case "book": {
      const [book, summaries] = await Promise.all([booksRepo.get(userId, id), summariesRepo.list(userId)]);
      if (!book) return null;
      return {
        type,
        title: hebrewOnly(book.hebrew_title) ?? hebrewOnly(book.title) ?? book.title,
        byline: hebrewOnly(book.author),
        background: hebrewOnly(book.description),
        points: stringArray(book.key_topics),
        notes: notesOn(summaries, "book", id),
      };
    }
    case "rabbi": {
      const [rabbi, summaries] = await Promise.all([rabbisRepo.get(userId, id), summariesRepo.list(userId)]);
      if (!rabbi) return null;
      const life = lifespanLabel(rabbi.birth_year ?? undefined, rabbi.death_year ?? undefined);
      return {
        type,
        title: rabbi.hebrew_name?.trim() || rabbi.name,
        byline: [eraLabel(rabbi.era), life].filter(Boolean).join(" · ") || undefined,
        background: hebrewOnly(rabbi.bio) ?? hebrewOnly(rabbi.historical_context),
        notes: notesOn(summaries, "rabbi", id),
      };
    }
    case "lesson": {
      const lesson = await lessonsRepo.get(userId, id);
      if (!lesson) return null;
      return {
        type,
        title: lesson.title,
        byline: lesson.speaker ?? undefined,
        background: lesson.summary ?? undefined,
        points: stringArray(lesson.key_points),
      };
    }
    case "summary": {
      const summary = await summariesRepo.get(userId, id);
      if (!summary) return null;
      return { type, title: summary.title, notes: [{ title: summary.title, text: summary.content }] };
    }
    case "concept": {
      const concept = await conceptsRepo.get(userId, id);
      if (!concept) return null;
      return { type, title: concept.term, background: concept.definition ?? undefined };
    }
    case "contradiction": {
      const alert = await contradictionAlertsRepo.get(userId, id);
      if (!alert) return null;
      const labels = await sideLabels(userId, [alert]);
      return {
        type,
        title: "סתירה בין הסיכומים",
        contradiction: {
          left: { label: labels.get(`${alert.left_type}:${alert.left_id}`) ?? "צד א׳", excerpt: alert.left_excerpt ?? "" },
          right: { label: labels.get(`${alert.right_type}:${alert.right_id}`) ?? "צד ב׳", excerpt: alert.right_excerpt ?? "" },
          explanation: alert.explanation,
        },
      };
    }
  }
}

/** The entity a note is filed on, as a label: "משנה ברורה", "הרב קוק". */
async function entityNames(userId: string) {
  const [books, rabbis] = await Promise.all([booksRepo.list(userId), rabbisRepo.list(userId)]);
  const names = new Map<string, string>();
  for (const b of books) names.set(`book:${b.id}`, hebrewOnly(b.hebrew_title) ?? b.title);
  for (const r of rabbis) names.set(`rabbi:${r.id}`, r.hebrew_name?.trim() || r.name);
  return names;
}

function summaryLabel(summary: SummaryRow, names: Map<string, string>): string {
  const filedOn = summary.entity_type && summary.entity_id ? names.get(`${summary.entity_type}:${summary.entity_id}`) : undefined;
  if (filedOn) return `הסיכום שלך על ${filedOn}`;
  if (summary.entity_type === "topic" && summary.entity_id) return `הסיכום שלך על ${summary.entity_id}`;
  return `הסיכום "${summary.title}"`;
}

/**
 * Every note that can take part in a contradiction: the learner's finished
 * summaries, and the summaries + key points of their processed lessons.
 */
export async function loadContradictionSides(userId: string): Promise<ContradictionSide[]> {
  const [summaries, lessons, names] = await Promise.all([
    summariesRepo.list(userId),
    lessonsRepo.list(userId),
    entityNames(userId),
  ]);

  const sides: ContradictionSide[] = [];
  for (const s of summaries) {
    if (s.is_draft || s.kind !== "summary" || !s.content.trim()) continue;
    sides.push({
      type: "summary",
      id: s.id,
      label: summaryLabel(s, names),
      anchor: s.entity_type && s.entity_id ? `${s.entity_type}:${s.entity_id}` : undefined,
      text: `${s.title}. ${s.content}`,
    });
  }
  for (const l of lessons) {
    if (l.status !== "ready" || !l.summary) continue;
    sides.push({
      type: "lesson",
      id: l.id,
      label: `השיעור "${l.title}"`,
      // A lesson on a book shares that book's line of study.
      anchor: l.book_id ? `book:${l.book_id}` : undefined,
      text: [l.summary, ...stringArray(l.key_points)].join("\n"),
    });
  }
  return sides;
}

/** Labels for both sides of each alert, resolved against current data. */
export async function sideLabels(userId: string, alerts: AlertRow[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (alerts.length === 0) return labels;
  const [summaries, lessons, names] = await Promise.all([
    summariesRepo.list(userId),
    lessonsRepo.list(userId),
    entityNames(userId),
  ]);
  const summaryById = new Map(summaries.map((s) => [s.id, s]));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  for (const alert of alerts) {
    for (const [type, id] of [
      [alert.left_type, alert.left_id],
      [alert.right_type, alert.right_id],
    ] as const) {
      const key = `${type}:${id}`;
      if (type === "summary") {
        const s = summaryById.get(id);
        labels.set(key, s ? summaryLabel(s, names) : "סיכום שנמחק");
      } else if (type === "lesson") {
        const l = lessonById.get(id);
        labels.set(key, l ? `השיעור "${l.title}"` : "שיעור שנמחק");
      }
    }
  }
  return labels;
}

/** Where a side lives in the app, for "open the note". */
export function sideHref(type: string, id: string, summaries?: Map<string, SummaryRow>): string | null {
  if (type === "lesson") return `/areas/torah/lessons/${id}`;
  if (type === "summary") {
    const s = summaries?.get(id);
    if (s?.entity_type === "book" && s.entity_id) return `/areas/torah/books/${s.entity_id}#my-notes`;
    if (s?.entity_type === "rabbi" && s.entity_id) return `/areas/torah/rabbis/${s.entity_id}#my-notes`;
    return "/areas/torah?tab=summaries";
  }
  return null;
}
