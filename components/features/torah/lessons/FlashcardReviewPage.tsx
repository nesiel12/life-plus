"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowRight, CalendarCheck, Layers, Loader2, RefreshCw } from "lucide-react";
import { ActionPill, SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { FlashcardDeck, type DeckSummary } from "@/components/features/torah/lessons/FlashcardDeck";
import { StatsStrip } from "@/components/features/torah/lessons/StatsStrip";
import { usePracticeStats } from "@/components/features/torah/lessons/usePracticeStats";
import type { FlashcardView } from "@/lib/torah/lessons/types";

/**
 * Today's spaced-repetition review, across every lesson.
 *
 * Opens with where the user stands (level, streak, mastery) and ends with what
 * the session did — one celebration per finished session, not per card.
 */
export function FlashcardReviewPage() {
  const reduceMotion = useReducedMotion();
  const { stats, reload: reloadStats } = usePracticeStats();
  const [cards, setCards] = useState<FlashcardView[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState<DeckSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setFinished(null);
    try {
      const response = await fetch("/api/torah/flashcards/due", { cache: "no-store" });
      const data = await response.json();
      setCards(Array.isArray(data.cards) ? data.cards : []);
      setTitles(data.lessonTitles ?? {});
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
      <Link
        href="/areas/torah?tab=shiurim"
        className="focus-ring glass-control-hover mb-5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
      >
        <ArrowRight size={14} aria-hidden />
        שיעורים
      </Link>

      <header className="mb-6 flex flex-col gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-gold-ink">
            <Layers size={13} aria-hidden />
            לתרגל
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">חזרה מרווחת</h1>
          <p className="text-sm text-muted">הכרטיסיות מכל השיעורים שהגיע זמנן — כל אחת חוזרת בדיוק כשהזיכרון מתחיל לדעוך.</p>
        </div>
        <StatsStrip stats={stats} />
      </header>

      <section className="mx-auto max-w-2xl">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            טוען כרטיסיות…
          </p>
        ) : !cards || cards.length === 0 ? (
          <SectionPlaceholder
            icon={CalendarCheck}
            title="אין כרטיסיות לחזרה כרגע"
            body="כל הכרטיסיות מתוזמנות לעתיד. תרגל חלק חדש מאחד השיעורים כדי להוסיף כרטיסיות."
          >
            <Link href="/areas/torah?tab=shiurim" className="focus-ring rounded-full bg-gold px-3 py-1.5 text-xs text-white">
              לשיעורים
            </Link>
          </SectionPlaceholder>
        ) : finished ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-hairline-card bg-surface p-8 text-center">
            <CalendarCheck size={30} className="text-accent-health" aria-hidden />
            <p className="text-xl font-semibold text-foreground">סיימת את החזרה להיום</p>
            <p className="text-sm text-muted">
              {finished.recalled} מתוך {finished.reviewed} נזכרו · <span className="ltr tabular-nums">+{finished.xp}</span> XP
            </p>
            <ActionPill icon={RefreshCw} onClick={() => void load()}>
              בדוק אם יש עוד
            </ActionPill>
          </div>
        ) : (
          <FlashcardDeck
            cards={cards}
            labelFor={(card) => (card.lessonId ? titles[card.lessonId] : undefined)}
            onFinish={(summary) => {
              setFinished(summary);
              void reloadStats();
              if (!reduceMotion && summary.reviewed >= 3) {
                void confetti({ particleCount: 80, spread: 65, origin: { y: 0.35 }, colors: ["#b89355", "#e6d5ad", "#2f9e44"] });
              }
            }}
          />
        )}
      </section>
    </main>
  );
}
