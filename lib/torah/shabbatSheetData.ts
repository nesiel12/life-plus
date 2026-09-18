import "server-only";
import { booksRepo } from "@/lib/db/books";
import { havrutaThreadsRepo } from "@/lib/db/havruta";
import { lessonsRepo } from "@/lib/db/lessons";
import { rabbisRepo } from "@/lib/db/rabbis";
import { summariesRepo } from "@/lib/db/summaries";
import { getSupabaseClient } from "@/lib/supabase";
import { parseStoredInsights } from "@/lib/torah/havruta";
import { hebrewOnly } from "@/lib/torah/hebrew";
import { buildShabbatSheet, sheetWeek, type ShabbatSheet } from "@/lib/torah/shabbatSheet";
import type { PracticeQuestionKindDb } from "@/types/database";

// Gathering one week of learning for the printed sheet.
//
// The week is computed first (lib/torah/shabbatSheet.ts) so the two heavy
// tables — practice questions and flashcards — are queried by date instead of
// loaded whole; the small ones are filtered in the pure builder.

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function loadShabbatSheet(
  userId: string,
  timeZone: string,
  weekOffset = 0,
  now: Date = new Date()
): Promise<ShabbatSheet> {
  const week = sheetWeek(now, timeZone, weekOffset);
  const since = week.start.toISOString();
  const client = getSupabaseClient();

  const [summaries, lessons, threads, books, rabbis, questions, cards] = await Promise.all([
    summariesRepo.list(userId),
    lessonsRepo.list(userId),
    havrutaThreadsRepo.listUpdatedSince(userId, week.start),
    booksRepo.list(userId),
    rabbisRepo.list(userId),
    client
      .from("practice_questions")
      .select("id, prompt, model_answer, kind, lesson_id, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .lt("created_at", week.end.toISOString()),
    client
      .from("srs_cards")
      .select("id, front, back, lapses, ease_factor, created_at, last_reviewed_at, suspended_at")
      .eq("user_id", userId)
      .or(`created_at.gte.${since},last_reviewed_at.gte.${since}`),
  ]);
  if (questions.error) throw questions.error;
  if (cards.error) throw cards.error;

  const subjectNames = new Map<string, string>();
  for (const b of books) subjectNames.set(`book:${b.id}`, hebrewOnly(b.hebrew_title) ?? b.title);
  for (const r of rabbis) subjectNames.set(`rabbi:${r.id}`, r.hebrew_name?.trim() || r.name);
  const lessonTitles = new Map(lessons.map((l) => [l.id, l.title]));

  return buildShabbatSheet({
    now,
    timeZone,
    weekOffset,
    summaries: summaries
      .filter((s) => s.kind === "summary")
      .map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        isDraft: s.is_draft,
        subject:
          s.entity_type && s.entity_id
            ? subjectNames.get(`${s.entity_type}:${s.entity_id}`) ?? (s.entity_type === "topic" ? s.entity_id : undefined)
            : undefined,
        updatedAt: s.updated_at,
      })),
    lessons: lessons.map((l) => ({
      id: l.id,
      title: l.title,
      summary: l.summary,
      keyPoints: stringArray(l.key_points),
      speaker: l.speaker,
      status: l.status,
      processedAt: l.processed_at,
    })),
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title,
      insights: parseStoredInsights(t.insights),
      updatedAt: t.updated_at,
    })),
    questions: (questions.data ?? []).map((q) => ({
      id: q.id,
      prompt: q.prompt,
      modelAnswer: q.model_answer,
      kind: q.kind as PracticeQuestionKindDb,
      lessonTitle: q.lesson_id ? lessonTitles.get(q.lesson_id) : undefined,
      createdAt: q.created_at,
    })),
    cards: (cards.data ?? []).map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      lapses: c.lapses,
      easeFactor: c.ease_factor,
      createdAt: c.created_at,
      lastReviewedAt: c.last_reviewed_at,
      suspended: Boolean(c.suspended_at),
    })),
  });
}
