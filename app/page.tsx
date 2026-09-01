"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { CalendarHeart, ArrowLeft, Sparkles } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { LifeCompass } from "@/components/features/LifeCompass";
import { AIBriefing } from "@/components/features/AIBriefing";
import { EnergyLevelBadge } from "@/components/features/EnergyLevelBadge";
import { ScreenTimeWidget } from "@/components/features/ScreenTimeWidget";
import { GoalsPanel } from "@/components/features/GoalsPanel";
import { BentoGrid, BentoCard } from "@/components/magicui/bento-grid";
import { RetroGrid } from "@/components/magicui/retro-grid";
import { LightRays } from "@/components/magicui/light-rays";
import { KineticText } from "@/components/magicui/kinetic-text";
import { TypingAnimation } from "@/components/magicui/typing-animation";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { Confetti, type ConfettiRef } from "@/components/magicui/confetti";
import { daysUntil } from "@/lib/utils";
import { greetingForHour } from "@/lib/greeting";

const MAX_UPCOMING_ON_DASHBOARD = 3;

const CONFETTI_GOLD = ["#b89355", "#e6d3a4", "#876628", "#cc1f78", "#1a72bb", "#2f9e44"];

export default function Home() {
  const { data: session } = useSession();
  const user = useAtlasStore((s) => s.user);
  const lifeAreas = useAtlasStore((s) => s.lifeAreas);
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

  const avgScore = useMemo(
    () =>
      lifeAreas.length
        ? Math.round(lifeAreas.reduce((sum, a) => sum + a.score, 0) / lifeAreas.length)
        : 0,
    [lifeAreas]
  );

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
      <div className="relative overflow-hidden border-b border-hairline px-6 pb-12 pt-16 sm:px-10 sm:pt-24 lg:px-16">
        <RetroGrid
          className="opacity-[0.35]"
          angle={68}
          cellSize={52}
          opacity={0.5}
          lightLineColor="#e0cfa6"
          darkLineColor="rgba(208,170,102,0.30)"
        />
        <LightRays className="opacity-70" count={6} length="55vh" />

        <div className="relative z-10 mx-auto max-w-5xl">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-gold-ink" aria-hidden />
            <KineticText
              as="span"
              dir="ltr"
              text="LIFE PLUS"
              className="text-gold-gradient text-xs font-semibold tracking-[0.42em] uppercase"
            />
          </div>

          <div className="flex items-center gap-4">
            {session?.user?.image && (
              <Image
                src={session.user.image}
                alt=""
                width={52}
                height={52}
                className="rounded-full ring-1 ring-hairline"
                aria-hidden
              />
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.6rem] sm:leading-[1.1]">
              {greeting ? (
                <TypingAnimation
                  as="span"
                  duration={55}
                  className="text-3xl font-semibold tracking-tight sm:text-[2.6rem]"
                >
                  {`${greeting}, ${displayName}`}
                </TypingAnimation>
              ) : (
                <span>שלום, {displayName}</span>
              )}
            </h1>
          </div>

          {user.lifeStage && <p className="mt-2 text-muted">{user.lifeStage}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-baseline gap-1.5 rounded-full border border-gold-line bg-gold-soft px-3.5 py-1.5">
              <NumberTicker value={avgScore} className="ltr text-lg font-semibold text-gold-ink" />
              <span className="text-xs text-gold-ink/80">מדד חיים כולל</span>
            </div>
            <EnergyLevelBadge />
            <ScreenTimeWidget />
          </div>
        </div>
      </div>

      {/* ─── Bento dashboard ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-16">
        <BentoGrid>
          <BentoCard className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
            <AIBriefing />
          </BentoCard>

          <BentoCard>
            <p className="mb-3 flex items-center justify-between text-sm font-medium text-muted">
              מצפן החיים
              <span className="ltr text-gold-ink">
                <NumberTicker value={avgScore} className="font-semibold" />%
              </span>
            </p>
            <div className="flex flex-1 items-center justify-center">
              <LifeCompass areas={lifeAreas} />
            </div>
          </BentoCard>

          <BentoCard>
            <p className="mb-3 text-sm font-medium text-muted">הכוונה של היום</p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setTodayIntention(draft)}
              placeholder="על מה תרצה להתמקד היום?"
              aria-label="הכוונה של היום"
              rows={4}
              className="focus-ring w-full flex-1 resize-none rounded-xl border border-hairline bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </BentoCard>

          <BentoCard className="sm:col-span-2" href="/calendar" cta="ליומן החכם">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
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
                    <li key={event.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-foreground/90">
                        <CalendarHeart size={16} className="text-accent-family" aria-hidden />
                        {event.title}
                        <span className="text-xs text-muted">· {categoryLabel(event.category)}</span>
                      </span>
                      <span className="ltr text-xs text-muted">{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </BentoCard>

          <BentoCard className="sm:col-span-2 lg:col-span-3" interactive={false}>
            <GoalsPanel />
          </BentoCard>
        </BentoGrid>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted"
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
