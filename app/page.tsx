"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { CalendarHeart, ArrowLeft, Check, LayoutGrid, RotateCcw } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { AIBriefing } from "@/components/features/AIBriefing";
import { EnergyLevelBadge } from "@/components/features/EnergyLevelBadge";
import { ScreenTimeWidget } from "@/components/features/ScreenTimeWidget";
import { GoalsPanel } from "@/components/features/GoalsPanel";
import { RecentActivityCard } from "@/components/features/RecentActivityCard";
import { MemoryCards } from "@/components/features/memories/MemoryCards";
import { NowNextCard } from "@/components/features/dashboard/NowNextCard";
import { TodayStructureCard } from "@/components/features/dashboard/TodayStructureCard";
import { HebrewCalendarCard } from "@/components/features/dashboard/HebrewCalendarCard";
import { MotivationCard } from "@/components/features/dashboard/MotivationCard";
import { PhotosWidget } from "@/components/features/dashboard/PhotosWidget";
import { UniversalInputBar } from "@/components/features/dashboard/UniversalInputBar";
import { IntentionComposer } from "@/components/features/dashboard/IntentionComposer";
import { WidgetFrame } from "@/components/features/dashboard/WidgetFrame";
import { BentoGrid, BentoCard } from "@/components/magicui/bento-grid";
import { RetroGrid } from "@/components/magicui/retro-grid";
import { LightRays } from "@/components/magicui/light-rays";
import { Confetti, type ConfettiRef } from "@/components/magicui/confetti";
import { KineticText } from "@/components/magicui/kinetic-text";
import { Logo } from "@/components/ui/Logo";
import { daysUntil } from "@/lib/utils";
import { timeOfDayFromHour } from "@/lib/greeting";
import { useT, type TranslationKey } from "@/lib/i18n/useT";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { hiddenWidgets, isCustomised, spanOf, visibleWidgets } from "@/lib/dashboard/layout";
import type { ReactNode } from "react";

const MAX_UPCOMING_ON_DASHBOARD = 3;

const CONFETTI_GOLD = ["#b89355", "#e6d3a4", "#876628", "#cc1f78", "#1a72bb", "#2f9e44"];

export default function Home() {
  const { data: session } = useSession();
  const user = useAtlasStore((s) => s.user);
  const goals = useAtlasStore((s) => s.goals);
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);

  const { layout, move, moveTo, hide, restore, resize, reset } = useDashboardLayout();
  const [editing, setEditing] = useState(false);

  // Real time-of-day, computed after mount from the user's own browser clock.
  const t = useT();
  const [greetingKey, setGreetingKey] = useState<TranslationKey | null>(null);
  useEffect(() => {
    const tod = timeOfDayFromHour(new Date().getHours());
    const map: Record<string, TranslationKey> = {
      morning: "dashboard.greetingMorning",
      afternoon: "dashboard.greetingAfternoon",
      evening: "dashboard.greetingEvening",
      night: "dashboard.greetingNight",
    };
    setGreetingKey(map[tod]);
  }, []);
  const greeting = greetingKey ? t(greetingKey) : null;

  const displayName = session?.user?.name ?? user.hebrewName;

  // Confetti on a goal reaching 100% — only for a goal that *becomes* complete
  // while the page is open, never on first hydration.
  const confettiRef = useRef<ConfettiRef>(null);
  const completeGoalIds = useMemo(
    () =>
      new Set(
        goals.filter((g) => g.milestones.length > 0 && g.milestones.every((m) => m.done)).map((g) => g.id)
      ),
    [goals]
  );
  const seenComplete = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seenComplete.current === null) {
      seenComplete.current = new Set(completeGoalIds);
      return;
    }
    const isNew = [...completeGoalIds].some((id) => !seenComplete.current!.has(id));
    seenComplete.current = new Set(completeGoalIds);
    if (isNew) {
      confettiRef.current?.fire({ particleCount: 130, spread: 90, startVelocity: 42, colors: CONFETTI_GOLD, origin: { y: 0.7 } });
    }
  }, [completeGoalIds]);

  return (
    <main className="min-h-screen">
      <Confetti
        ref={confettiRef}
        manualstart
        className="pointer-events-none fixed inset-0 z-[60]"
      />

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <header className="relative isolate overflow-hidden px-6 pb-10 pt-10 sm:px-10 sm:pb-12 sm:pt-14 lg:px-16">
        {/* The atmosphere layer covers the whole header box and is feathered
            with a radial mask, so the grid has no edge on any side — it just
            dissolves into the page. Kept wide so the grid actually reaches the
            edges of a full-width header rather than fading to blank on the
            sides. */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(180%_150%_at_50%_-10%,black_45%,rgba(0,0,0,0.4)_78%,transparent_100%)]"
        >
          <RetroGrid
            noScrim
            className="opacity-80"
            angle={70}
            cellSize={58}
            opacity={0.6}
            lightLineColor="#d3b884"
            darkLineColor="rgba(208,170,102,0.34)"
          />
          <LightRays className="opacity-60" count={6} length="70vh" />
        </motion.div>

        {/* soft warm wash on top of the grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_50%_-10%,color-mix(in_srgb,var(--gold)_13%,transparent),transparent_62%)]"
        />

        {/* One row that spans the full width: the greeting sits on the
            inline-start edge, the day's context chips on the inline-end edge,
            so a wide header is used end to end instead of a lopsided block of
            text with dead space beside it. Stacks on a phone. */}
        <div className="relative flex w-full flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="min-w-0">
            {/* Brand kicker — the isolated mark with the wordmark beside it. */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="mb-4 flex items-center gap-3"
            >
              <Logo size={40} className="shrink-0" />
              <KineticText
                as="span"
                dir="ltr"
                text="LIFE PLUS"
                animateOnLoad
                delay={0.15}
                letterClassName="text-gold-gradient"
                className="text-base font-bold uppercase leading-none tracking-[0.32em] sm:text-lg"
              />
            </motion.div>

            {/* The greeting. Sized to be a warm hello, not a billboard —
                capped at 6xl so it never leaves a wall of empty space beside
                it on a wide screen. */}
            <h1 className="flex flex-wrap items-baseline gap-x-[0.3em] text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              <KineticText
                key={greeting ?? "pending"}
                as="span"
                text={`${greeting ?? "שלום"},`}
                animateOnLoad
                wordSafe
                delay={0.1}
                className="font-bold text-foreground"
              />
              <KineticText
                as="span"
                text={displayName}
                animateOnLoad
                wordSafe
                delay={0.32}
                letterClassName="text-gold-gradient"
                className="font-bold"
              />
            </h1>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.42, ease: "easeOut" }}
            className="flex flex-wrap items-center gap-2.5 lg:justify-end"
          >
            {session?.user?.image && (
              <Image
                src={session.user.image}
                alt=""
                width={34}
                height={34}
                className="rounded-full ring-1 ring-gold-line"
                aria-hidden
              />
            )}
            {user.lifeStage && (
              <span className="inline-flex items-center rounded-full border border-hairline-card bg-surface/70 px-3 py-1.5 text-xs text-muted">
                {user.lifeStage}
              </span>
            )}
            <EnergyLevelBadge />
            <ScreenTimeWidget />
          </motion.div>
        </div>
      </header>

      {/* ─── Bento dashboard ──────────────────────────────────────────────── */}
      <div className="w-full px-6 pb-16 sm:px-10 lg:px-16">
        {/* Widget bodies, keyed by registry id. The grid below renders
            whichever of these the user's layout asks for, in their order —
            the arrangement lives in data, not in this JSX. */}
        {(() => {
          const CONTENT: Record<string, { node: ReactNode; tilt?: boolean; href?: string; cta?: string }> = {
            "command-bar": { node: <UniversalInputBar /> },
            "now-next": { node: <NowNextCard /> },
            "today-structure": { node: <TodayStructureCard /> },
            "hebrew-calendar": { node: <HebrewCalendarCard /> },
            "motivation": { node: <MotivationCard /> },
            "photos": { node: <PhotosWidget />, tilt: false },
            "ai-briefing": { node: <AIBriefing bare /> },
            intention: { node: <IntentionComposer />, tilt: false },
            "upcoming-moments": {
              href: "/calendar",
              cta: "ליומן החכם",
              node: (
                <>
                  <p className="mb-5 flex items-center gap-2 text-sm font-medium text-muted">
                    <CalendarHeart size={16} className="text-accent-family" aria-hidden />
                    רגעים משמעותיים בקרוב
                  </p>
                  {upcomingEvents.length === 0 ? (
                    <p className="text-xs text-muted">אין כרגע רגעים מתוזמנים.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {upcomingEvents.slice(0, MAX_UPCOMING_ON_DASHBOARD).map((event) => {
                        const diff = daysUntil(event.date);
                        const label =
                          diff === 0 ? "היום" : diff === 1 ? "מחר" : diff > 1 ? `בעוד ${diff} ימים` : "עבר";
                        return (
                          <li
                            key={event.id}
                            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-hairline-card bg-surface-sunken/60 px-3.5 py-2.5 text-sm"
                          >
                            <span className="flex min-w-0 items-center gap-2 text-foreground/90">
                              <CalendarHeart size={15} className="shrink-0 text-accent-family" aria-hidden />
                              <span className="truncate">{event.title}</span>
                              <span className="shrink-0 text-xs text-muted">
                                · {categoryLabel(event.category)}
                              </span>
                            </span>
                            <span className="ltr shrink-0 whitespace-nowrap text-xs text-muted">{label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ),
            },
            "recent-activity": { node: <RecentActivityCard /> },
            memories: { node: <MemoryCards />, tilt: false },
            goals: { node: <GoalsPanel bare />, tilt: false },
          };

          const visible = visibleWidgets(layout);
          const hiddenList = hiddenWidgets(layout);

          return (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                {editing && isCustomised(layout) && (
                  <button
                    onClick={reset}
                    className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
                  >
                    <RotateCcw size={12} aria-hidden />
                    אפס סידור
                  </button>
                )}
                <button
                  onClick={() => setEditing((v) => !v)}
                  aria-pressed={editing}
                  className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground"
                >
                  {editing ? <Check size={13} aria-hidden /> : <LayoutGrid size={13} aria-hidden />}
                  {editing ? "סיום עריכה" : "ערוך מסך"}
                </button>
              </div>

              <BentoGrid>
                {visible.map((widget, index) => {
                  const entry = CONTENT[widget.id];
                  // A registry entry with no body would render an empty card.
                  // Skipping is the honest response to a mismatch this file
                  // and lib/dashboard/layout.ts are supposed to keep in step.
                  if (!entry) return null;
                  return (
                    <WidgetFrame
                      key={widget.id}
                      widget={widget}
                      span={spanOf(layout, widget.id)}
                      editing={editing}
                      isFirst={index === 0}
                      isLast={index === visible.length - 1}
                      onMove={(delta) => move(widget.id, delta)}
                      onDropOn={(draggedId) => moveTo(draggedId, widget.id)}
                      onHide={() => hide(widget.id)}
                      onResize={() => resize(widget.id)}
                    >
                      <BentoCard tilt={entry.tilt} href={entry.href} cta={entry.cta}>
                        {entry.node}
                      </BentoCard>
                    </WidgetFrame>
                  );
                })}
              </BentoGrid>

              {/* Hidden widgets stay reachable. "Delete" on a dashboard the
                  app itself ships has to mean "put away", not "destroy" —
                  there would be nothing to restore from. */}
              {editing && hiddenList.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-hairline-card p-3">
                  <span className="text-xs text-muted">מוסתרים:</span>
                  {hiddenList.map((widget) => (
                    <button
                      key={widget.id}
                      onClick={() => restore(widget.id)}
                      className="glass-control-hover focus-ring rounded-lg px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
                    >
                      + {widget.title}
                    </button>
                  ))}
                </div>
              )}
            </>
          );
        })()}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-10 flex items-center justify-center gap-1.5 text-center text-xs text-muted"
        >
          <ArrowLeft size={12} aria-hidden />
          <Link href="/areas" className="focus-ring rounded transition-colors hover:text-gold-ink">
            כל תחומי החיים
          </Link>
        </motion.p>
      </div>
    </main>
  );
}
