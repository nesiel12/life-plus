"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { CalendarHeart, ArrowLeft, PenLine } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { AIBriefing } from "@/components/features/AIBriefing";
import { EnergyLevelBadge } from "@/components/features/EnergyLevelBadge";
import { ScreenTimeWidget } from "@/components/features/ScreenTimeWidget";
import { GoalsPanel } from "@/components/features/GoalsPanel";
import { RecentActivityCard } from "@/components/features/RecentActivityCard";
import { MemoryCards } from "@/components/features/memories/MemoryCards";
import { TodayTimelineCard } from "@/components/features/dashboard/TodayTimelineCard";
import { FinanceAlertCard } from "@/components/features/dashboard/FinanceAlertCard";
import { NextCourseCard } from "@/components/features/dashboard/NextCourseCard";
import { BentoGrid, BentoCard } from "@/components/magicui/bento-grid";
import { RetroGrid } from "@/components/magicui/retro-grid";
import { LightRays } from "@/components/magicui/light-rays";
import { Confetti, type ConfettiRef } from "@/components/magicui/confetti";
import { KineticText } from "@/components/magicui/kinetic-text";
import { Logo } from "@/components/ui/Logo";
import { daysUntil } from "@/lib/utils";
import { greetingForHour } from "@/lib/greeting";

const MAX_UPCOMING_ON_DASHBOARD = 3;

const CONFETTI_GOLD = ["#b89355", "#e6d3a4", "#876628", "#cc1f78", "#1a72bb", "#2f9e44"];

export default function Home() {
  const { data: session } = useSession();
  const user = useAtlasStore((s) => s.user);
  const goals = useAtlasStore((s) => s.goals);
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);
  const todayIntention = useAtlasStore((s) => s.todayIntention);
  const setTodayIntention = useAtlasStore((s) => s.setTodayIntention);
  const [draft, setDraft] = useState(todayIntention);

  // Real time-of-day, computed after mount from the user's own browser clock.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

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
      <header className="relative isolate overflow-hidden px-6 pb-16 pt-16 sm:px-10 sm:pb-20 sm:pt-24 lg:px-16">
        {/* The atmosphere layer covers the whole header box and is feathered
            with a radial mask, so the grid has no edge on any side — it just
            dissolves into the page. */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(135%_120%_at_50%_0%,black_30%,rgba(0,0,0,0.55)_62%,transparent_88%)]"
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

        <div className="relative mx-auto max-w-6xl">
          {/* Brand kicker — the isolated mark with the wordmark beside it. */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="mb-6 flex items-center gap-3 sm:gap-4"
          >
            <Logo size={52} className="shrink-0" />
            <KineticText
              as="span"
              dir="ltr"
              text="LIFE PLUS"
              animateOnLoad
              delay={0.15}
              letterClassName="text-gold-gradient"
              className="text-xl font-bold uppercase leading-none tracking-[0.34em] sm:text-2xl"
            />
          </motion.div>

          {/* The greeting is the header text now that the wordmark lives in
              the artwork, so KineticText carries it: letters stage in on load
              and respond to the pointer. wordSafe keeps Hebrew words whole
              when the line wraps. Keyed on the greeting so the letters
              re-stage once the real time-of-day resolves after mount. */}
          <h1 className="flex max-w-4xl flex-wrap items-baseline gap-x-[0.3em] text-5xl font-bold leading-[1.06] tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl">
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

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.42, ease: "easeOut" }}
            className="mt-8 flex flex-wrap items-center gap-2.5"
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
      <div className="mx-auto max-w-6xl px-6 pb-16 sm:px-10 lg:px-16">
        <BentoGrid>
          <BentoCard className="sm:col-span-2">
            <AIBriefing bare />
          </BentoCard>

          <BentoCard>
            <TodayTimelineCard />
          </BentoCard>

          <BentoCard>
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
              <PenLine size={16} className="text-gold-ink" aria-hidden />
              הכוונה של היום
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setTodayIntention(draft)}
              placeholder="על מה תרצה להתמקד היום?"
              aria-label="הכוונה של היום"
              rows={5}
              className="focus-ring w-full min-h-[8rem] flex-1 resize-none rounded-xl border border-hairline-card bg-surface-sunken/70 px-3.5 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted"
            />
          </BentoCard>

          <BentoCard className="sm:col-span-2" href="/calendar" cta="ליומן החכם">
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
          </BentoCard>

          <BentoCard>
            <RecentActivityCard />
          </BentoCard>

          <BentoCard>
            <FinanceAlertCard />
          </BentoCard>

          {/* A dense form panel (video controls) — tilt is off so the
              embedded player stays crisp. */}
          <BentoCard tilt={false}>
            <NextCourseCard />
          </BentoCard>

          {/* A dense form panel — tilt is off here so inputs stay crisp. */}
          <BentoCard className="sm:col-span-2 lg:col-span-3" tilt={false}>
            <MemoryCards />
          </BentoCard>

          <BentoCard className="sm:col-span-2 lg:col-span-3" tilt={false}>
            <GoalsPanel bare />
          </BentoCard>
        </BentoGrid>

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
