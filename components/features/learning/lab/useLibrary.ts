"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addLearningBookAction,
  addLearningQuoteAction,
  deleteLearningBookAction,
  deleteLearningQuoteAction,
  listLearningBooksAction,
  listLearningQuotesAction,
  updateLearningBookAction,
} from "@/app/actions/learningBooks";
import type { LearningBook, LearningBookKind, LearningBookUnit, LearningQuote } from "@/types";

// The reading shelf and quotes vault's data, as a lighter-weight hook rather
// than more entries on the already-large Zustand store — same call the
// Health module already made (components/features/health/useHealthData.ts):
// this is feature-scoped data a handful of screens read, not something every
// page needs at bootstrap.
export function useLibrary() {
  const [books, setBooks] = useState<LearningBook[] | null>(null);
  const [quotes, setQuotes] = useState<LearningQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, q] = await Promise.all([listLearningBooksAction(), listLearningQuotesAction()]);
      setBooks(b);
      setQuotes(q);
    } catch {
      setBooks((current) => current ?? []);
      setQuotes((current) => current ?? []);
      setError("לא הצלחנו לטעון את הספרייה.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addBook = useCallback(
    async (input: { title: string; author?: string; category?: string; kind?: LearningBookKind; topicId?: string; totalUnits?: number; unitLabel?: LearningBookUnit }) => {
      const created = await addLearningBookAction(input);
      setBooks((current) => [created, ...(current ?? [])]);
      return created;
    },
    []
  );

  const updateBook = useCallback(async (bookId: string, patch: Partial<LearningBook>) => {
    const previous = books;
    setBooks((current) => (current ?? []).map((b) => (b.id === bookId ? { ...b, ...patch } : b)));
    try {
      const updated = await updateLearningBookAction(bookId, patch);
      setBooks((current) => (current ?? []).map((b) => (b.id === bookId ? updated : b)));
      return updated;
    } catch (err) {
      setBooks(previous);
      throw err;
    }
    // books is read only for the rollback snapshot; including it would re-create
    // this callback on every fetch, defeating memoisation for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeBook = useCallback(async (bookId: string) => {
    const previous = books;
    setBooks((current) => (current ?? []).filter((b) => b.id !== bookId));
    setQuotes((current) => (current ?? []).filter((q) => q.bookId !== bookId));
    try {
      await deleteLearningBookAction(bookId);
    } catch (err) {
      setBooks(previous);
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addQuote = useCallback(async (input: { bookId: string; text: string; note?: string; chapterLabel?: string }) => {
    const created = await addLearningQuoteAction(input);
    setQuotes((current) => [created, ...(current ?? [])]);
    return created;
  }, []);

  const removeQuote = useCallback(async (quoteId: string) => {
    const previous = quotes;
    setQuotes((current) => (current ?? []).filter((q) => q.id !== quoteId));
    try {
      await deleteLearningQuoteAction(quoteId);
    } catch (err) {
      setQuotes(previous);
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    books,
    quotes,
    loading: books === null || quotes === null,
    error,
    addBook,
    updateBook,
    removeBook,
    addQuote,
    removeQuote,
  };
}
