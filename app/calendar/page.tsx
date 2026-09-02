"use client";

import { motion } from "framer-motion";
import { signIn } from "next-auth/react";
import { CalendarClock, CalendarHeart, Clock } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { ScheduleSuggestions } from "@/components/features/ScheduleSuggestions";
import { VerticalTimeline } from "@/components/features/calendar/VerticalTimeline";
import { CalendarAgentPanel } from "@/components/features/calendar/CalendarAgentPanel";
import { useInsights } from "@/hooks/useInsights";
import { groupUpcomingEvents } from "@/lib/calendar/groupUpcomingEvents";
import { daysUntil } from "@/lib/utils";
import type { GoogleCalendarEvent } from "@/lib/googleCalendar/fetchEvents";

interface UpcomingResponse {
  connected: boolean;
  events: GoogleCalendarEvent[];
}

const FALLBACK: UpcomingResponse = { connected: false, events: [] };

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

// Smart Calendar (docs/ATLAS_ARCHITECTURE_VISION.md): a real page, not a
// placeholder. Two independent real data sources, kept visually and
// semantically distinct rather than merged into one fabricated list: the
// user's actual Google Calendar (app/api/calendar/upcoming, grouped into
// Today/Tomorrow/Upcoming) is what's literally on the calendar; "meaningful
// moments coming up" (the existing upcoming_events store data — birthdays,
// personal milestones) is a different, curated concept that already had
// its own section here. The AI schedule-suggestion pipeline
// (ScheduleSuggestions) is unchanged.
export default function CalendarPage() {
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);
  const { data, refresh } = useInsights<UpcomingResponse>("/api/calendar/upcoming", FALLBACK);
  const groups = data ? groupUpcomingEvents(data.events, new Date()) : [];

  // The vertical timeline shows today only; groupUpcomingEvents already
  // separates Today from later days, so reuse its notion of "today" rather
  // than re-deriving a second, possibly-disagreeing one.
  const now = new Date();
  const startOfTomorrow = new Date(now);
  startOfTomorrow.setHours(24, 0, 0, 0);
  const todayEvents = (data?.events ?? []).filter((e) => {
    const start = new Date(e.start).getTime();
    return start >= new Date(now).setHours(0, 0, 0, 0) && start < startOfTomorrow.getTime();
  });
  const busy = (data?.events ?? []).map((e) => ({ start: e.start, end: e.end, title: e.title }));

  return (
    <main className="hero-gradient relative min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mb-10"
      >
        <p className="mb-2 flex items-center gap-2 text-sm text-muted">
          <CalendarClock size={16} className="text-accent-career" aria-hidden />
          יומן חכם
        </p>
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">מה עומד לקרות</h1>
        <p className="mt-2 text-muted">הצעות זמן מבוססות על היומן האמיתי שלך, ורגעים משמעותיים שבדרך.</p>
      </motion.div>

      <div className="flex flex-col gap-6">
        <ScheduleSuggestions />

        {data?.connected && (
          <GlassCard delay={0.08}>
            <CalendarAgentPanel busy={busy} onCreated={refresh} />
          </GlassCard>
        )}

        {data?.connected && (
          <GlassCard delay={0.1}>
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
              <Clock size={16} className="text-accent-career" aria-hidden />
              היום, שעה אחר שעה
            </p>
            <VerticalTimeline
              day={now}
              now={now}
              events={todayEvents}
              chronotype={chronotype}
            />
          </GlassCard>
        )}

        {data && !data.connected ? (
          <GlassCard delay={0.12} className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent-career/15 text-accent-career">
              <CalendarClock size={22} aria-hidden />
            </span>
            <div>
              <p className="mb-1 font-medium text-foreground">היומן שלך עדיין לא מחובר</p>
              <p className="text-sm text-muted">התחבר ליומן Google כדי לראות כאן את האירועים האמיתיים שלך.</p>
            </div>
            <button
              onClick={() => signIn("google", { callbackUrl: "/calendar" })}
              className="focus-ring mt-1 flex items-center gap-2 rounded-lg bg-accent-career/20 px-4 py-2 text-sm font-medium text-accent-career transition-opacity hover:opacity-80"
            >
              <CalendarClock size={14} aria-hidden />
              התחבר ליומן Google
            </button>
          </GlassCard>
        ) : data && data.connected && groups.length === 0 ? (
          <GlassCard delay={0.12} className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent-career/15 text-accent-career">
              <CalendarHeart size={22} aria-hidden />
            </span>
            <p className="font-medium text-foreground">היומן נקי לגמרי להיום</p>
            <p className="text-sm text-muted">אין אירועים קרובים ביומן שלך.</p>
          </GlassCard>
        ) : (
          groups.map((group, gi) => (
            <GlassCard key={group.label} delay={0.12 + gi * 0.05}>
              <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
                <Clock size={16} className="text-accent-career" aria-hidden />
                {group.label}
              </p>
              <ul className="flex flex-col gap-3">
                {group.events.map((event) => (
                  <li key={event.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground/90">{event.title}</span>
                    <span className="ltr text-xs text-muted">
                      {formatEventTime(event.start)}–{formatEventTime(event.end)}
                    </span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))
        )}

        <GlassCard delay={0.3}>
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
            <CalendarHeart size={16} className="text-accent-family" aria-hidden />
            רגעים משמעותיים בקרוב
          </p>
          {upcomingEvents.length === 0 ? (
            <p className="text-xs text-muted">אין כרגע רגעים מתוזמנים.</p>
          ) : (
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
          )}
        </GlassCard>
      </div>
    </main>
  );
}
