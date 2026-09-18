// The Havruta and contradiction shapes the API returns and the UI renders.
// Client-safe: row → view mapping only, no database access.

import {
  normalizeMoves,
  parseStoredInsights,
  type HavrutaInsight,
  type HavrutaMode,
  type HavrutaMove,
  type HavrutaSubjectType,
} from "@/lib/torah/havruta";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];

export interface HavrutaCitationView {
  reference: string;
  note: string;
  verified: boolean;
  sefariaRef: string | null;
  sefariaUrl: string | null;
  quotedText: string | null;
}

export interface HavrutaMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  moves: HavrutaMove[];
  citations: HavrutaCitationView[];
  createdAt: string;
}

export interface HavrutaThreadView {
  id: string;
  subjectType: HavrutaSubjectType;
  subjectId: string;
  mode: HavrutaMode;
  title: string | null;
  insights: HavrutaInsight[];
  insightsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContradictionSideView {
  type: "summary" | "lesson" | "concept";
  id: string;
  label: string;
  excerpt: string;
  href: string | null;
}

export interface ContradictionAlertView {
  id: string;
  kind: "halachic" | "logical" | null;
  explanation: string;
  confidence: number;
  left: ContradictionSideView;
  right: ContradictionSideView;
  threadId: string | null;
  createdAt: string;
}

export function toThreadView(row: Tables["havruta_threads"]["Row"]): HavrutaThreadView {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    mode: row.mode,
    title: row.title,
    insights: parseStoredInsights(row.insights),
    insightsAt: row.insights_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isCitation(value: unknown): value is HavrutaCitationView {
  return Boolean(value) && typeof (value as { reference?: unknown }).reference === "string";
}

export function toMessageView(row: Tables["havruta_messages"]["Row"]): HavrutaMessageView {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    moves: normalizeMoves(Array.isArray(row.moves) ? row.moves.filter((m): m is string => typeof m === "string") : []),
    citations: Array.isArray(row.citations) ? (row.citations as unknown[]).filter(isCitation) : [],
    createdAt: row.created_at,
  };
}

/** Hebrew for "how long ago", compact: "היום", "אתמול", "לפני 3 ימים". */
export function relativeDayLabel(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days === 2) return "שלשום";
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 14) return "לפני שבוע";
  return `לפני ${Math.floor(days / 7)} שבועות`;
}

/** Where "open the subject" goes for a thread. */
export function subjectHref(type: HavrutaSubjectType, id: string): string | null {
  switch (type) {
    case "book":
      return `/areas/torah/books/${id}`;
    case "rabbi":
      return `/areas/torah/rabbis/${id}`;
    case "lesson":
      return `/areas/torah/lessons/${id}`;
    case "summary":
      return "/areas/torah?tab=summaries";
    default:
      return null;
  }
}
