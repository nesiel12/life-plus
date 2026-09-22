// דף סיכום להדפסה — assembling one topic's printable study sheet: what is
// left on the syllabus, the quotes saved against any book linked to the
// topic, and the mastery score, all capped so the sheet stays a page or two,
// not a database dump. Mirrors lib/torah/shabbatSheet.ts's role exactly (a
// pure assembler the print page calls), including reusing its own
// clipAtSentence so a long quote or note is clipped the same way a Shabbat
// sheet clips a long summary.

import { clipAtSentence } from "@/lib/torah/shabbatSheet";
import { MASTERY_LEVEL_LABELS, type MasteryResult } from "@/lib/learning/mastery";
import type { LearningQuote, LearningResource, LearningTopic } from "@/types";

const LIMITS = {
  steps: 12,
  quotes: 6,
  quoteChars: 240,
} as const;

export interface StudySheetStep {
  title: string;
  done: boolean;
  typeLabel: string;
}

export interface StudySheetQuote {
  text: string;
  chapterLabel?: string;
  bookTitle: string;
}

export interface StudySheet {
  topicTitle: string;
  category?: string;
  mastery: { score: number; label: string };
  steps: StudySheetStep[];
  doneCount: number;
  totalCount: number;
  quotes: StudySheetQuote[];
  isEmpty: boolean;
}

const TYPE_LABEL: Record<LearningResource["type"], string> = {
  youtube: "סרטון",
  podcast: "פודקאסט",
  article: "מאמר",
  equipment: "ציוד",
  summary: "סיכום",
};

export interface BuildStudySheetInput {
  topic: LearningTopic;
  resources: readonly LearningResource[];
  /** Quotes with the title of the book each came from, already joined. */
  quotes: readonly (LearningQuote & { bookTitle: string })[];
  mastery: MasteryResult;
}

export function buildStudySheet(input: BuildStudySheetInput): StudySheet {
  const steps = input.resources.slice(0, LIMITS.steps).map((r) => ({
    title: r.title,
    done: r.isCompleted,
    typeLabel: TYPE_LABEL[r.type],
  }));

  const quotes = input.quotes.slice(0, LIMITS.quotes).map((q) => ({
    text: clipAtSentence(q.text, LIMITS.quoteChars),
    chapterLabel: q.chapterLabel,
    bookTitle: q.bookTitle,
  }));

  return {
    topicTitle: input.topic.title,
    category: input.topic.category,
    mastery: { score: input.mastery.score, label: MASTERY_LEVEL_LABELS[input.mastery.tier] },
    steps,
    doneCount: input.resources.filter((r) => r.isCompleted).length,
    totalCount: input.resources.length,
    quotes,
    isEmpty: input.resources.length === 0 && input.quotes.length === 0,
  };
}
