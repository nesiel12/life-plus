"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { booksRepo } from "@/lib/db/books";
import { toBook, toBookPatch } from "@/lib/mappers";
import { z } from "zod";
import { openOrCreateBook, promoteBookAuthor } from "@/lib/torah/library";
import type { Book } from "@/types";

export async function addBookAction(input: { title: string; author?: string; category?: string; notes?: string }) {
  const userId = await getCurrentUserId();
  const row = await booksRepo.insert({
    user_id: userId,
    title: input.title,
    author: input.author ?? null,
    category: input.category ?? null,
    notes: input.notes ?? null,
  });
  return toBook(row);
}

/**
 * Adds a book the user picked out of the search command center, enriched.
 *
 * The suggestion carries only what the autocomplete returned (usually just a
 * title), so the full record is fetched server-side rather than trusted from
 * the client: a server action's arguments are user input, and writing a
 * client-supplied cover URL straight into the database would let any caller
 * point an <img> in the app at anything they like.
 *
 * Open-or-create rather than a blind insert: picking a sefer that is already
 * on the shelf opens it instead of adding a second copy.
 */
const providerBookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  provider: z.enum(["sefaria", "googleBooks"]).optional(),
  sefariaTitle: z.string().trim().min(1).max(200).optional(),
});

export async function addBookFromProviderAction(input: z.input<typeof providerBookSchema>) {
  const userId = await getCurrentUserId();
  const parsed = providerBookSchema.parse(input);
  return openOrCreateBook(userId, parsed);
}

const openBookSchema = providerBookSchema.extend({
  authorRabbiId: z.string().uuid().optional(),
  authorOrigin: z.enum(["import", "ai", "user"]).optional(),
  authorConfidence: z.number().min(0).max(1).optional(),
  authorName: z.string().trim().max(120).optional(),
});

/**
 * The Rabbi → Book hop of the investigation loop: open the book's page,
 * creating the book first if it is not in the library, and record who wrote
 * it when the click came from that rabbi's bookshelf.
 */
export async function openOrCreateBookAction(input: z.input<typeof openBookSchema>) {
  const userId = await getCurrentUserId();
  return openOrCreateBook(userId, openBookSchema.parse(input));
}

/**
 * The Book → Rabbi hop: the author's page, creating the rabbi on first visit.
 * Returns an `error` string rather than throwing for the expected case of a
 * book with no known author, so the page can say so in Hebrew.
 */
export async function openBookAuthorAction(bookId: string) {
  const userId = await getCurrentUserId();
  return promoteBookAuthor(userId, z.string().uuid().parse(bookId));
}

export async function updateBookAction(bookId: string, patch: Partial<Book>) {
  const userId = await getCurrentUserId();
  const row = await booksRepo.update(userId, bookId, toBookPatch(patch));
  return toBook(row);
}

export async function deleteBookAction(bookId: string) {
  const userId = await getCurrentUserId();
  await booksRepo.remove(userId, bookId);
}
