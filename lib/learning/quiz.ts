import { normalizeText } from "@/lib/learning/topicSearch";
import type { QuizQuestionRecord } from "@/types";

// Grading a generated quiz.
//
// The AI writes the questions and a correct answer once, up front
// (app/api/ai/learning-lab/route.ts) — it never re-reads the user's answer
// later to decide right/wrong, which would make the same answer gradable two
// different ways on a retry. Grading itself is this pure, deterministic
// module: an MCQ is exact-match against the option the model marked correct,
// and a short answer is compared with the same normalization the topic search
// already uses (case/niqqud/punctuation-insensitive), so "כן" and "כן." grade
// the same without the model needing to enumerate every acceptable phrasing.

export type QuizQuestionKind = "mcq" | "short";

export interface GeneratedQuestion {
  prompt: string;
  kind: QuizQuestionKind;
  /** Present for "mcq" only, in display order; null/absent for "short". */
  options?: string[] | null;
  /** The option's text (for mcq) or the model answer (for short). */
  correctAnswer: string;
}

const HEBREW_PREFIXES = new Set(["ו", "ה", "ב", "ל", "מ", "ש", "כ"]);

/**
 * Strips one leading Hebrew conjunction/preposition letter (ו/ה/ב/ל/מ/ש/כ),
 * so "וחום" and "חום" compare equal.
 *
 * Deliberately more generous than lib/learning/topicGraph.ts's `stemsOf`
 * (which floors a stripped stem at 4 letters, to avoid two topics reading as
 * related over a short, coincidental root). Grading needs the opposite bias:
 * being unfair to a correct answer over one stripped prefix letter is worse
 * than the rare case of two unrelated short words colliding, so this floors
 * at 2 rather than 4.
 */
function stripHebrewPrefix(word: string): string {
  return word.length > 2 && HEBREW_PREFIXES.has(word[0]) ? word.slice(1) : word;
}

/**
 * A short answer is graded by whether its meaningful words are a superset of
 * the correct answer's — not exact equality, which would fail "פריז" against
 * "זו פריז" for the same reason `filterTopics` already needs word-level
 * matching rather than string equality. A short reference answer (the normal
 * case) is a real check; a full-sentence reference degrades gracefully to
 * "did they mention the key terms", which is the honest limit of grading free
 * text without another model call.
 */
export function isAnswerCorrect(kind: QuizQuestionKind, correctAnswer: string, userAnswer: string): boolean {
  const given = normalizeText(userAnswer);
  if (!given) return false;

  if (kind === "mcq") return given === normalizeText(correctAnswer);

  const expectedWords = normalizeText(correctAnswer).split(" ").filter((w) => w.length > 1);
  if (expectedWords.length === 0) return given === normalizeText(correctAnswer);
  const givenWords = given.split(" ").filter((w) => w.length > 1).map(stripHebrewPrefix);
  return expectedWords.every((expected) => givenWords.includes(stripHebrewPrefix(expected)));
}

export interface GradedQuiz {
  records: QuizQuestionRecord[];
  score: number;
  total: number;
  /** 0..1 */
  fraction: number;
}

/**
 * Grades a whole attempt. `answers` and `questions` are matched by index —
 * the UI collects one answer per question in order, same as the syllabus
 * being an ordered list rather than keyed by id.
 */
export function gradeQuiz(questions: readonly GeneratedQuestion[], answers: readonly string[]): GradedQuiz {
  const records: QuizQuestionRecord[] = questions.map((q, i) => {
    const userAnswer = (answers[i] ?? "").trim();
    const correct = isAnswerCorrect(q.kind, q.correctAnswer, userAnswer);
    return { prompt: q.prompt, kind: q.kind, options: q.options, correctAnswer: q.correctAnswer, userAnswer, correct };
  });

  const score = records.filter((r) => r.correct).length;
  const total = records.length;
  return { records, score, total, fraction: total === 0 ? 0 : score / total };
}

/** "4/5", for a compact score chip. */
export function scoreLabel(score: number, total: number): string {
  return `${score}/${total}`;
}
