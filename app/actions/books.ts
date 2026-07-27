"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { booksRepo } from "@/lib/db/books";
import { toBook, toBookPatch } from "@/lib/mappers";
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

export async function updateBookAction(bookId: string, patch: Partial<Book>) {
  const userId = await getCurrentUserId();
  const row = await booksRepo.update(userId, bookId, toBookPatch(patch));
  return toBook(row);
}

export async function deleteBookAction(bookId: string) {
  const userId = await getCurrentUserId();
  await booksRepo.remove(userId, bookId);
}
