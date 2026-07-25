"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { CalendarHeart, ArrowLeft } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { LifeCompass } from "@/components/features/LifeCompass";
import { AIBriefing } from "@/components/features/AIBriefing";
import { EnergyLevelBadge } from "@/components/features/EnergyLevelBadge";
import { ScreenTimeWidget } from "@/components/features/ScreenTimeWidget";
import { GoalsPanel } from "@/components/features/GoalsPanel";
import { daysUntil } from "@/lib/utils";
import { greetingForHour } from "@/lib/greeting";

const MAX_UPCOMING_ON_DASHBOARD = 3;

export default function Home() {
  const { data: session } = useSession();
  const user = useAtlasStore((s) => s.user);
  const lifeAreas = useAtlasStore((s) => s.lifeAreas);
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);
  const todayIntention = useAtlasStore((s) => s.todayIntention);
  const setTodayIntention = useAtlasStore((s) => s.setTodayIntention);
  const [draft, setDraft] = useState(todayIntention);

  // Real time-of-day, not a fixed "בוקר טוב" — computed after mount (the
  // user's own browser clock, not a server guess that could disagree with
  // it) so there's nothing to reconcile between server and client render.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  const displayName = session?.user?.name ?? user.hebrewName;

  return (
    <main className="min-h-screen">
      {/* Hero (UI/UX Revamp): a welcoming band at the top of the dashboard,
          not just a heading — the same real, non-fabricated signals
          (EnergyLevelBadge/ScreenTimeWidget) that used to sit as plain
          text lines now read as a small pill row under the greeting. */}
      <div className="hero-gradient glass-panel px-6 pb-10 pt-14 sm:px-10 sm:pt-20 lg:px-16">
        <div className="mb-2 flex items-center gap-3">
          {session?.user?.image && (
            <Image
              src={session.user.image}
              alt={displayName}
              width={48}
              height={48}
              className="rounded-full ring-1 ring-glass-border"
            />
          )}
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-3xl font-medium tracking-tight sm:text-4xl"
          >
            {greeting ?? "שלום"}, <span className="gradient-text">{displayName}</span>
          </motion.h1>
        </div>
        <p className="mb-4 text-muted">{user.lifeStage}</p>
        <div className="flex flex-wrap items-center gap-3">
          <EnergyLevelBadge />
          <ScreenTimeWidget />
        </div>
      </div>

      <div className="px-6 py-10 sm:px-10 lg:px-16">
        <div className="flex flex-col gap-6">
          <AIBriefing />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <GlassCard delay={0.1}>
              <p className="mb-3 text-sm font-medium text-muted">הכוונה של היום</p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => setTodayIntention(draft)}
                placeholder="על מה תרצה להתמקד היום?"
                aria-label="הכוונה של היום"
                rows={3}
                className="focus-ring w-full resize-none rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
            </GlassCard>

            <GlassCard delay={0.15}>
              <p className="mb-4 text-sm font-medium text-muted">מצפן החיים</p>
              <LifeCompass areas={lifeAreas} />
            </GlassCard>
          </div>

          <GlassCard delay={0.2}>
            <div className="mb-4 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium text-muted">
                <CalendarHeart size={16} className="text-accent-family" aria-hidden />
                רגעים משמעותיים בקרוב
              </p>
              <Link
                href="/calendar"
                className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
              >
                ליומן החכם
                <ArrowLeft size={12} aria-hidden />
              </Link>
            </div>
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
                        <CalendarHeart size={16} className="text-accent-family" />
                        {event.title}
                        <span className="text-xs text-muted">· {categoryLabel(event.category)}</span>
                      </span>
                      <span className="ltr text-xs text-muted">{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>

          <GoalsPanel />
        </div>
      </div>
    </main>
  );
}
