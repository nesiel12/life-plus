"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { CalendarHeart } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { LifeCompass } from "@/components/features/LifeCompass";
import { AIBriefing } from "@/components/features/AIBriefing";
import { EnergyLevelBadge } from "@/components/features/EnergyLevelBadge";
import { ScreenTimeWidget } from "@/components/features/ScreenTimeWidget";
import { ScheduleSuggestions } from "@/components/features/ScheduleSuggestions";
import { GoalsPanel } from "@/components/features/GoalsPanel";
import { daysUntil } from "@/lib/utils";
import { greetingForHour } from "@/lib/greeting";

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
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <div className="mb-1 flex items-center gap-3">
        {session?.user?.image && (
          <Image
            src={session.user.image}
            alt={displayName}
            width={44}
            height={44}
            className="rounded-full"
          />
        )}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-3xl font-medium tracking-tight sm:text-4xl"
        >
          {greeting ?? "שלום"}, {displayName}.
        </motion.h1>
      </div>
      <p className="mb-4 text-muted">{user.lifeStage}</p>
      <EnergyLevelBadge />
      <ScreenTimeWidget />

      <div className="flex flex-col gap-6">
        <AIBriefing />

        <GlassCard delay={0.1}>
          <p className="mb-3 text-sm font-medium text-muted">הכוונה של היום</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setTodayIntention(draft)}
            placeholder="על מה תרצה להתמקד היום?"
            aria-label="הכוונה של היום"
            rows={2}
            className="focus-ring w-full resize-none rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
        </GlassCard>

        <GlassCard delay={0.15}>
          <p className="mb-4 text-sm font-medium text-muted">מצפן החיים</p>
          <LifeCompass areas={lifeAreas} />
        </GlassCard>

        <ScheduleSuggestions />

        <GlassCard delay={0.22}>
          <p className="mb-4 text-sm font-medium text-muted">רגעים משמעותיים בקרוב</p>
          <ul className="flex flex-col gap-3">
            {upcomingEvents.map((event) => {
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
        </GlassCard>

        <GoalsPanel />
      </div>
    </main>
  );
}
