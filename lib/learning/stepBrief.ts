import type { StepBriefContent, StepConcept, StepRecallItem } from "@/types/learning";

// Pure logic behind the topic canvas's step brief: tidying what the model
// returned into something every renderer can trust, and the active-recall /
// metacognition rules. No React, no fetch — unit-tested in stepBrief.test.ts.

export const RECALL_BLANK = "___";

// --- Normalizing a generated brief ----------------------------------------

/**
 * Makes the model's brief internally consistent. Schema validation already
 * guarantees the shape; this fixes what a schema can't express:
 * `relatedTo` naming terms that don't exist, a comparison row with the wrong
 * number of cells, a "process" with no stages, a recall sentence whose blank
 * is missing or doubled.
 */
export function normalizeStepBrief(brief: StepBriefContent): StepBriefContent {
  const terms = new Set(brief.coreConcepts.map((c) => c.term));
  const coreConcepts = brief.coreConcepts.map((c) => ({
    ...c,
    relatedTo: [...new Set(c.relatedTo)].filter((t) => t !== c.term && terms.has(t)),
  }));

  const v = brief.visual;
  let visual = v;
  if (v.kind === "process" && v.processStages.length < 2) visual = { ...v, kind: "none" };
  if (v.kind === "comparison") {
    const width = v.comparisonColumns.length;
    const rows = v.comparisonRows.map((r) => ({ ...r, cells: Array.from({ length: width }, (_, i) => r.cells[i] ?? "—") }));
    visual = width < 2 || rows.length === 0 ? { ...v, kind: "none" } : { ...v, comparisonRows: rows };
  }

  const recall = brief.recall.map(fixRecallBlank).filter((r): r is StepRecallItem => r !== null);

  return { ...brief, coreConcepts, visual, recall };
}

/** Exactly one blank, or null if the sentence can't be salvaged. */
export function fixRecallBlank(item: StepRecallItem): StepRecallItem | null {
  const count = item.sentence.split(RECALL_BLANK).length - 1;
  if (count === 1) return item;
  if (count > 1) return null;
  // The model sometimes writes the answer instead of the blank.
  const at = item.sentence.indexOf(item.answer);
  if (at === -1) return null;
  return { ...item, sentence: item.sentence.slice(0, at) + RECALL_BLANK + item.sentence.slice(at + item.answer.length) };
}

export function splitRecallSentence(sentence: string): [string, string] {
  const at = sentence.indexOf(RECALL_BLANK);
  if (at === -1) return [sentence, ""];
  return [sentence.slice(0, at), sentence.slice(at + RECALL_BLANK.length)];
}

// --- Checking a fill-in answer --------------------------------------------

const NIQQUD = /[֑-ׇ]/g;
const PUNCTUATION = /[.,;:!?"'׳״`()[\]{}\-–—]/g;

/** Case, niqqud, punctuation and spacing don't make an answer wrong. */
export function normalizeAnswer(text: string): string {
  return text.normalize("NFC").replace(NIQQUD, "").replace(PUNCTUATION, " ").toLowerCase().replace(/\s+/g, " ").trim();
}

// One-letter Hebrew prefixes (ה, ו, ב, כ, ל, מ, ש) that attach to a word
// without changing what it means for a fill-in — "הפוטוסינתזה" answers
// "פוטוסינתזה". Only ever one letter off the *input*, and only when what is
// left is a whole acceptable answer of 3+ letters: stripping greedily, or
// from the answer side, turns real words into other real words.
const PREFIXES = "הובכלמש";

export function isRecallCorrect(item: Pick<StepRecallItem, "answer" | "acceptableAnswers">, input: string): boolean {
  const given = normalizeAnswer(input);
  if (!given) return false;
  const accepted = [item.answer, ...item.acceptableAnswers].map(normalizeAnswer).filter(Boolean);
  if (accepted.includes(given)) return true;
  if (PREFIXES.includes(given[0])) {
    const stripped = given.slice(1);
    return stripped.length >= 3 && accepted.includes(stripped);
  }
  return false;
}

// --- Metacognition: confidence before the answer is revealed -------------

export const CONFIDENCE_LEVELS = [
  { value: 1, label: "מנחש/ת" },
  { value: 2, label: "לא בטוח/ה" },
  { value: 3, label: "די בטוח/ה" },
  { value: 4, label: "בטוח/ה לגמרי" },
] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number]["value"];

export type Calibration = "calibrated-correct" | "calibrated-wrong" | "overconfident" | "underconfident";

/**
 * How well confidence matched the result. The feedback is the point of asking
 * first: being sure and wrong is the one outcome worth flagging loudly (an
 * illusion of knowing), and being unsure but right means the knowledge is
 * there and needs consolidating, not relearning.
 */
export function calibrationFor(confidence: ConfidenceLevel, correct: boolean): Calibration {
  const confident = confidence >= 3;
  if (correct) return confident ? "calibrated-correct" : "underconfident";
  return confident ? "overconfident" : "calibrated-wrong";
}

export const CALIBRATION_MESSAGE: Record<Calibration, string> = {
  "calibrated-correct": "היית בטוח/ה וצדקת — הידע הזה יציב.",
  underconfident: "צדקת, למרות שלא היית בטוח/ה. הידע שם — חזרה אחת נוספת תקבע אותו.",
  overconfident: "היית בטוח/ה, אבל זו טעות. שווה לעצור כאן: זו בדיוק 'אשליית ידיעה' — קרא/י שוב את ההסבר.",
  "calibrated-wrong": "הרגשת שזה לא יושב — והרגשת נכון. עכשיו זה הזמן לחזור על החלק הזה.",
};

// --- Concept matching (built from the brief's own concepts) ---------------

/** A small deterministic shuffle so the matching round doesn't reshuffle on every render. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface MatchingRound {
  /** The concepts whose definitions are shown, in display order. */
  prompts: StepConcept[];
  /** The terms to choose from, shuffled. */
  terms: string[];
}

export function buildMatchingRound(concepts: readonly StepConcept[], seed: string, size = 4): MatchingRound | null {
  if (concepts.length < 2) return null;
  const prompts = concepts.slice(0, size);
  const terms = seededShuffle(prompts.map((c) => c.term), seed);
  return { prompts, terms };
}

// --- Concept graph layout --------------------------------------------------

export interface GraphNode {
  term: string;
  x: number;
  y: number;
}
export interface GraphEdge {
  from: string;
  to: string;
}

/**
 * A deterministic ring layout (a handful of nodes — force simulation would be
 * overkill and would jitter on every render), plus undirected, de-duplicated
 * edges from `relatedTo`.
 */
export function conceptGraphLayout(concepts: readonly StepConcept[], width: number, height: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const n = concepts.length;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 48;
  const nodes = concepts.map((c, i) => {
    if (n === 1) return { term: c.term, x: cx, y: cy };
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { term: c.term, x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy + r * Math.sin(angle)) };
  });
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const c of concepts) {
    for (const t of c.relatedTo) {
      const key = [c.term, t].sort().join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: c.term, to: t });
    }
  }
  return { nodes, edges };
}

// --- Streaming preview -----------------------------------------------------

export interface StreamingBriefPreview {
  summary: string;
  concepts: { term: string; definition: string }[];
}

/**
 * What of a half-streamed brief is safe to show. Only reading content: the
 * interactive parts (recall answers, matching, practice) wait for the final,
 * validated brief — a fill-in whose answer is still being typed by the model
 * would mark a right answer wrong.
 */
export function streamingPreview(partial: unknown): StreamingBriefPreview {
  const p = (partial && typeof partial === "object" ? partial : {}) as { summary?: unknown; coreConcepts?: unknown };
  const summary = typeof p.summary === "string" ? p.summary : "";
  const concepts = Array.isArray(p.coreConcepts)
    ? p.coreConcepts.flatMap((c) => {
        const cc = (c ?? {}) as { term?: unknown; definition?: unknown };
        return typeof cc.term === "string" && cc.term && typeof cc.definition === "string" && cc.definition ? [{ term: cc.term, definition: cc.definition }] : [];
      })
    : [];
  return { summary, concepts };
}
