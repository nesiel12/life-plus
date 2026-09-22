"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { learningBooksRepo } from "@/lib/db/learningBooks";
import { learningQuotesRepo } from "@/lib/db/learningQuotes";
import { learningTopicsRepo } from "@/lib/db/learning";
import { toLearningBook, toLearningBookPatch, toLearningQuote } from "@/lib/mappers";
import type { LearningBook, LearningBookKind, LearningBookUnit } from "@/types";

export async function listLearningBooksAction() {
  const userId = await getCurrentUserId();
  const rows = await learningBooksRepo.list(userId);
  return rows.map(toLearningBook);
}

/** Every quote the user has saved, across every book — the vault's own list, not filtered by book. */
export async function listLearningQuotesAction() {
  const userId = await getCurrentUserId();
  const rows = await learningQuotesRepo.list(userId);
  return rows.map(toLearningQuote);
}

export async function addLearningBookAction(input: {
  title: string;
  author?: string;
  category?: string;
  kind?: LearningBookKind;
  topicId?: string;
  totalUnits?: number;
  unitLabel?: LearningBookUnit;
}) {
  const userId = await getCurrentUserId();
  if (input.topicId) await learningTopicsRepo.verifyOwnership(userId, input.topicId);
  const row = await learningBooksRepo.insert({
    user_id: userId,
    topic_id: input.topicId ?? null,
    kind: input.kind ?? "book",
    title: input.title,
    author: input.author ?? null,
    category: input.category ?? null,
    unit_label: input.unitLabel ?? "page",
    total_units: input.totalUnits ?? 0,
    status: "to_read",
  });
  return toLearningBook(row);
}

export async function updateLearningBookAction(bookId: string, patch: Partial<LearningBook>) {
  const userId = await getCurrentUserId();
  const row = await learningBooksRepo.update(userId, bookId, toLearningBookPatch(patch));
  return toLearningBook(row);
}

// learning_quotes cascades on book deletion (migration's `on delete
// cascade`), so no separate quote cleanup is needed here.
export async function deleteLearningBookAction(bookId: string) {
  const userId = await getCurrentUserId();
  await learningBooksRepo.remove(userId, bookId);
}

export async function addLearningQuoteAction(input: { bookId: string; text: string; note?: string; chapterLabel?: string }) {
  const userId = await getCurrentUserId();
  const row = await learningQuotesRepo.insert({
    user_id: userId,
    book_id: input.bookId,
    quote_text: input.text,
    note: input.note ?? null,
    chapter_label: input.chapterLabel ?? null,
  });
  return toLearningQuote(row);
}

export async function deleteLearningQuoteAction(quoteId: string) {
  const userId = await getCurrentUserId();
  await learningQuotesRepo.remove(userId, quoteId);
}
