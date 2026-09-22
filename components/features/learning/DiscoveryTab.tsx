"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Compass, Flame, Loader2, Network, Sparkles, Wand2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useLab } from "@/components/features/learning/lab/LabContext";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { GlowBorder } from "@/components/features/learning/lab/GlowBorder";
import { energyGuidance } from "@/lib/dashboard/context";
import { energyCurve } from "@/lib/health/energyCurve";
import { useNow } from "@/hooks/useNow";
import { buildRecommendations, type RecommendationReasonKind } from "@/lib/learning/recommendations";
import { suggestNewTopics } from "@/lib/learning/labClient";
import { youtubeSearchUrl } from "@/lib/learning/youtube";
import type { TopicSuggestions } from "@/lib/ai/agents/learningLabAgent";
import type { LearningResource, LearningTopic } from "@/types";
import { cn } from "@/lib/utils";

interface DiscoveryTabProps {
  topics: readonly LearningTopic[];
  resources: readonly LearningResource[];
}

const REASON_ICON: Record<RecommendationReasonKind, typeof Flame> = {
  energy: Flame,
  momentum: Network,
  stalled: Compass,
};

const REASON_TONE: Record<RecommendationReasonKind, string> = {
  energy: "text-accent-fitness bg-accent-fitness/12",
  momentum: "text-accent-learning bg-accent-learning/12",
  stalled: "text-gold-ink bg-[color-mix(in_srgb,var(--gold)_16%,transparent)]",
};

const REASON_TITLE: Record<RecommendationReasonKind, string> = {
  energy: "מתאים לאנרגיה שלך עכשיו",
  momentum: "רכיבה על מומנטום",
  stalled: "כדאי לחזור אליו",
}

/**
 * הצעות למידה — two feeds side by side: real signals already in the lab's
 * own data (what fits your energy right now, a topic riding a related one's
 * momentum, something stalled worth reviving — lib/learning/recommendations.ts,
 * no model call), and a small AI-generated feed of brand-new topic ideas,
 * clearly labelled as suggestions rather than facts. "1-click תתחיל ללמוד"
 * either opens an existing topic or — for a new AI idea — creates it, builds
 * it a syllabus (the same generateLearningPath the topic canvas uses), and
 * opens it in one motion.
 */
export function DiscoveryTab({ topics, resources }: DiscoveryTabProps) {
  const lab = useLab();
  const reduce = useLabReducedMotion();
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);
  const goals = useAtlasStore((s) => s.goals);
  const addLearningTopic = useAtlasStore((s) => s.addLearningTopic);
  const generateLearningPath = useAtlasStore((s) => s.generateLearningPath);
  const now = useNow(60_000);

  const [aiSuggestions, setAiSuggestions] = useState<TopicSuggestions["suggestions"] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const curve = useMemo(() => energyCurve({ chronotype }), [chronotype]);
  const recommendations = useMemo(
    () => (now ? buildRecommendations(topics, resources, energyGuidance(curve, now), now) : []),
    [topics, resources, curve, now]
  );

  async function fetchAiSuggestions() {
    setAiLoading(true);
    setAiError(null);
    try {
      const activeGoalTitles = goals.filter((g) => g.milestones.some((m) => !m.done)).map((g) => g.title);
      const result = await suggestNewTopics(
        topics.map((t) => ({ title: t.title, category: t.category })),
        activeGoalTitles
      );
      setAiSuggestions(result.suggestions);
    } catch {
      setAiError("לא הצלחנו לייצר הצעות כרגע. נסה שוב.");
    } finally {
      setAiLoading(false);
    }
  }

  async function startExisting(topicId: string) {
    lab.audio.play("pop");
    lab.openTopic(topicId);
  }

  async function startNew(suggestion: TopicSuggestions["suggestions"][number]) {
    const key = suggestion.title;
    setStartingId(key);
    try {
      const created = await addLearningTopic({ title: suggestion.title, category: suggestion.category });
      lab.audio.play("pop");
      await generateLearningPath(created.id, created.title).catch(() => undefined);
      setAiSuggestions((current) => current?.filter((s) => s.title !== key) ?? null);
      lab.openTopic(created.id);
    } catch {
      setAiError("לא הצלחנו להוסיף את הנושא. נסה שוב.");
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="המלצות מהנתונים שלך" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">בשבילך עכשיו</h2>
        {recommendations.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline-card p-6 text-center text-sm text-muted">
            עוד אין מספיק נתונים להמלצה אמיתית — תוסיף נושא או שניים במפת הידע ותחזור לכאן.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((rec, i) => {
              const Icon = REASON_ICON[rec.kind];
              return (
                <motion.div
                  key={rec.topic.id}
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0 } : { delay: Math.min(i * 0.06, 0.3), type: "spring", bounce: 0.2 }}
                  className="flex flex-col gap-3 rounded-2xl border border-hairline-card bg-surface p-4"
                >
                  <span className={cn("flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", REASON_TONE[rec.kind])}>
                    <Icon size={12} aria-hidden />
                    {REASON_TITLE[rec.kind]}
                  </span>
                  <h3 className="text-sm font-semibold text-foreground">{rec.topic.title}</h3>
                  <p className="text-xs leading-relaxed text-muted">{rec.reason}</p>
                  <MagneticButton
                    onClick={() => void startExisting(rec.topic.id)}
                    className="mt-auto flex w-fit items-center gap-1.5 rounded-xl bg-accent-learning/15 px-3 py-1.5 text-xs font-medium text-accent-learning transition-opacity hover:opacity-80"
                  >
                    <Sparkles size={12} aria-hidden />
                    התחל ללמוד
                  </MagneticButton>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="הצעות AI לנושאים חדשים" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Wand2 size={16} className="text-accent-learning" aria-hidden />
            רעיונות חדשים מ-AI
          </h2>
          <MagneticButton
            onClick={() => void fetchAiSuggestions()}
            disabled={aiLoading}
            className="flex items-center gap-1.5 rounded-xl border border-hairline-card bg-fill-subtle px-3 py-1.5 text-xs font-medium text-foreground transition-opacity disabled:opacity-50"
          >
            {aiLoading ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />}
            {aiSuggestions ? "רענן הצעות" : "הצע לי נושאים"}
          </MagneticButton>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          אלה רעיונות, לא עובדות על מה שאתה כבר יודע — AI מציע נושאים חדשים שמתחברים למה שאתה לומד ולמטרות הפעילות שלך.
        </p>

        {aiError && <p className="text-xs text-accent-family">{aiError}</p>}

        {aiSuggestions && aiSuggestions.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {aiSuggestions.map((s) => (
              <GlowBorder key={s.title} active radius="rounded-2xl" seconds={5}>
                <div className="flex flex-col gap-2.5 p-4">
                  <span className="w-fit rounded-full bg-fill-subtle px-2 py-0.5 text-[10px] text-muted">{s.category}</span>
                  <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                  <p className="text-xs leading-relaxed text-muted">{s.reason}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <MagneticButton
                      onClick={() => void startNew(s)}
                      disabled={startingId === s.title}
                      className="flex items-center gap-1.5 rounded-xl bg-accent-learning px-3 py-1.5 text-xs font-semibold text-background transition-opacity disabled:opacity-50"
                    >
                      {startingId === s.title ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Sparkles size={12} aria-hidden />}
                      התחל ללמוד
                    </MagneticButton>
                    <a
                      href={youtubeSearchUrl(s.title)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline"
                    >
                      חפש ב-YouTube
                    </a>
                  </div>
                </div>
              </GlowBorder>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
