import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { contradictionAlertsRepo, contradictionScanRepo } from "@/lib/db/havruta";
import { summariesRepo } from "@/lib/db/summaries";
import {
  contradictionCandidates,
  contradictionPrompt,
  contradictionSystemPrompt,
  shouldRaiseAlert,
  usableSides,
} from "@/lib/torah/contradictions";
import { loadContradictionSides, sideHref, sideLabels } from "@/lib/torah/havrutaContext";
import { cleanReply } from "@/lib/torah/havruta";
import type { ContradictionAlertView } from "@/lib/torah/havrutaDto";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Pairs judged per scan. One structured call; bounded prompt, bounded bill. */
const PAIRS_PER_SCAN = 8;

const verdictSchema = z.object({
  verdicts: z
    .array(
      z.object({
        pair: z.number().int().describe("מספר הזוג כפי שמופיע בשאלה"),
        conflict: z.boolean().describe("true רק אם יש סתירה אמיתית"),
        kind: z.enum(["halachic", "logical"]).describe("halachic=סתירה בפסק, logical=סתירה בטענה"),
        explanation: z.string().describe("משפט או שניים בעברית אל הלומד. ריק אם אין סתירה."),
        confidence: z.number().min(0).max(1).describe("עד כמה אתה בטוח שזו סתירה אמיתית"),
      })
    )
    .describe("פסק דין אחד לכל זוג"),
});

async function openAlerts(userId: string): Promise<ContradictionAlertView[]> {
  const rows = await contradictionAlertsRepo.listOpen(userId, 20);
  if (rows.length === 0) return [];
  const [labels, summaries] = await Promise.all([sideLabels(userId, rows), summariesRepo.list(userId)]);
  const summaryById = new Map(summaries.map((s) => [s.id, s]));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    explanation: row.explanation,
    confidence: row.confidence,
    threadId: row.thread_id,
    createdAt: row.created_at,
    left: {
      type: row.left_type,
      id: row.left_id,
      label: labels.get(`${row.left_type}:${row.left_id}`) ?? "צד א׳",
      excerpt: row.left_excerpt ?? "",
      href: sideHref(row.left_type, row.left_id, summaryById),
    },
    right: {
      type: row.right_type,
      id: row.right_id,
      label: labels.get(`${row.right_type}:${row.right_id}`) ?? "צד ב׳",
      excerpt: row.right_excerpt ?? "",
      href: sideHref(row.right_type, row.right_id, summaryById),
    },
  }));
}

/** GET — open contradiction alerts, with both sides labelled. */
export async function GET() {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  return NextResponse.json({ alerts: await openAlerts(auth.user.id) });
}

/**
 * POST — scans the learner's notes for contradictions.
 *
 * Deterministic preselection first (lib/torah/contradictions.ts): only pairs
 * from different books/lessons, on a shared subject, not already judged with
 * the same text. Then one structured model call judges those pairs. Every
 * judged pair is remembered, conflict or not, so the next scan is only about
 * what changed.
 */
export async function POST() {
  const auth = await requireSessionUser({ key: "torah-contradiction-scan", limit: 6, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;

  const [sides, scanned] = await Promise.all([loadContradictionSides(user.id), contradictionScanRepo.scannedMap(user.id)]);
  const candidates = contradictionCandidates(sides, { scanned, limit: PAIRS_PER_SCAN });
  // What the learner is told apart: "you have nothing to compare yet" and
  // "nothing changed since the last scan" are different answers, and a note
  // too short to judge counts as nothing to compare.
  const notes = usableSides(sides).length;

  if (candidates.length === 0) {
    return NextResponse.json({ scanned: 0, found: 0, notes, alerts: await openAlerts(user.id) });
  }
  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "אין מפתח AI מחובר, אז אי אפשר לסרוק כרגע." });
  }

  try {
    const object = await generateStructuredData({
      actor: await currentUserActor(),
      schema: verdictSchema,
      system: contradictionSystemPrompt(),
      prompt: contradictionPrompt(candidates),
    });

    const byPair = new Map(object.verdicts.map((v) => [v.pair, v]));
    const raised = candidates.flatMap((candidate, index) => {
      const verdict = byPair.get(index + 1);
      if (!verdict) return [];
      const cleaned = { ...verdict, explanation: cleanReply(verdict.explanation) };
      if (!shouldRaiseAlert(cleaned)) return [];
      return [
        {
          user_id: user.id,
          left_type: candidate.left.type,
          left_id: candidate.left.id,
          right_type: candidate.right.type,
          right_id: candidate.right.id,
          explanation: cleaned.explanation,
          confidence: cleaned.confidence,
          kind: cleaned.kind,
          left_excerpt: candidate.leftExcerpt,
          right_excerpt: candidate.rightExcerpt,
        },
      ];
    });

    await contradictionAlertsRepo.insertNew(raised);
    // Only pairs the model actually returned a verdict for are remembered —
    // a pair it skipped must be judged next time, not silently marked clean.
    await contradictionScanRepo.record(
      candidates
        .map((candidate, index) => ({ candidate, verdict: byPair.get(index + 1) }))
        .filter((entry) => entry.verdict)
        .map(({ candidate, verdict }) => ({
          user_id: user.id,
          pair_key: candidate.pairKey,
          fingerprint: candidate.fingerprint,
          conflict: Boolean(verdict?.conflict),
          scanned_at: new Date().toISOString(),
        }))
    );

    return NextResponse.json({
      scanned: candidates.length,
      found: raised.length,
      notes,
      alerts: await openAlerts(user.id),
    });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("contradiction scan failed:", err);
    return NextResponse.json({ error: "הסריקה נכשלה. נסה שוב." });
  }
}
