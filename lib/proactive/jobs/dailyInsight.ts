import "server-only";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import {
  buildIntelligenceSignals,
  rankSignals,
  formatSignalsForPrompt,
} from "@/lib/intelligence/core";
import { insightsRepo } from "@/lib/db/insights";
import { generateChatText, isProviderConfigured } from "@/lib/ai";
import { notify } from "@/lib/notify";
import { buildDedupeKey } from "@/lib/proactive/dedupe";
import { withTimeout } from "@/lib/proactive/withTimeout";
import type { Job } from "@/lib/proactive/types";

const AI_TIMEOUT_MS = 25_000;

const SYSTEM_PROMPT = `את/ה אטלס — עוזר/ת אישי/ת פרואקטיבי/ת שמכיר/ה את המשתמש לעומק.
כתוב/י תובנה יומית אחת קצרה (2–3 משפטים), בעברית טבעית וחמה, בגוף שני.
התבסס/י אך ורק על הנתונים שסופקו. אל תמציא/י עובדות. בלי כותרת, בלי רשימות — פסקה אחת.`;

/**
 * Nightly per-user. Runs the (deterministic) Atlas Intelligence Engine, then
 * phrases the top-ranked signals as one warm Hebrew insight — via the LLM when
 * a provider is configured, or an honest deterministic rendering of the same
 * signals when it isn't. Persists an `insights` row and queues a
 * `daily_insight` notification (dedupe-keyed to the logical day, so a re-run
 * never double-posts).
 */
export const dailyInsightJob: Job = {
  name: "daily_insight",
  scope: "per_user",
  async run({ userId, logicalDay }) {
    if (!userId) return { itemsProduced: 0 };

    const context = await buildAtlasContext(userId);
    const ranked = rankSignals(buildIntelligenceSignals(context));
    if (ranked.length === 0) {
      return { itemsProduced: 0, detail: { reason: "no signals" } };
    }

    const formatted = formatSignalsForPrompt(ranked, 4);
    let body: string;
    let aiUsed = false;

    if (isProviderConfigured()) {
      try {
        body = (
          await withTimeout(
            generateChatText({
              system: SYSTEM_PROMPT,
              prompt: `הנתונים הרלוונטיים כרגע:\n${formatted}\n\nכתוב/י את התובנה היומית.`,
            }),
            AI_TIMEOUT_MS,
            "daily_insight generateChatText"
          )
        ).trim();
        aiUsed = true;
      } catch {
        // A slow/misconfigured provider must not wedge the nightly sweep —
        // fall back to an honest deterministic rendering of the same signals.
        body = deterministicInsight(ranked);
      }
    } else {
      body = deterministicInsight(ranked);
    }

    if (!body) return { itemsProduced: 0, detail: { reason: "empty body" } };

    await insightsRepo.insert({ user_id: userId, content: body });

    const outcome = await notify({
      userId,
      kind: "daily_insight",
      title: "התובנה היומית שלך",
      body,
      reason: `על סמך: ${ranked[0].summary}`,
      dedupeKey: buildDedupeKey("daily_insight", "", logicalDay),
    });

    return {
      itemsProduced: 1,
      detail: { aiUsed, notified: outcome.created, channels: outcome.channels, signalCount: ranked.length },
    };
  },
};

function deterministicInsight(ranked: ReturnType<typeof rankSignals>): string {
  const stripEnd = (s: string) => s.replace(/[.。]\s*$/, "").trim();
  const top = ranked.slice(0, 2).map((s) => stripEnd(s.summary));
  if (top.length === 1) return `היום שווה לשים לב ל${top[0]}.`;
  return `היום שווה לשים לב לשני דברים: ${top[0]}; וגם ${top[1]}.`;
}
