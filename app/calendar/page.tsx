"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { signIn } from "next-auth/react";
import { CalendarClock, CalendarDays, CalendarHeart, ChevronDown, ChevronLeft, ChevronRight, Clock, Pencil, Sparkles } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { DayView } from "@/components/features/calendar/DayView";
import { WeekView } from "@/components/features/calendar/WeekView";
import { YearView } from "@/components/features/calendar/YearView";
import { RangeTabs } from "@/components/features/calendar/RangeTabs";
import { CalendarAgentPanel } from "@/components/features/calendar/CalendarAgentPanel";
import { MonthView } from "@/components/features/calendar/MonthView";
import { ScheduleCopilotBar } from "@/components/features/calendar/ScheduleCopilotBar";
import { DayTasksPanel } from "@/components/features/calendar/DayTasksPanel";
import type { WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import {
  DeleteEventButton,
  DeleteEventDialog,
  useEventDeletion,
  type DeletableEvent,
} from "@/components/features/calendar/DeleteEventDialog";
import { useInsights } from "@/hooks/useInsights";
import { groupUpcomingEvents } from "@/lib/calendar/groupUpcomingEvents";
import { isWithinRange, rangeLabel, stepAnchor, type CalendarRange } from "@/lib/calendar/ranges";
import { daysUntil } from "@/lib/utils";
import type { GoogleCalendarEvent } from "@/lib/googleCalendar/fetchEvents";
import { BackToHome } from "@/components/layout/BackToHome";
import { cn } from "@/lib/utils";

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
  const { data, setData, refresh } = useInsights<UpcomingResponse>("/api/calendar/upcoming", FALLBACK);

  const handleDeleted = useCallback(
    (deleted: DeletableEvent) => {
      setData((current) =>
        current
          ? { ...current, events: current.events.filter((e) => e.id !== deleted.id) }
          : current
      );
      refresh();
    },
    [setData, refresh]
  );

  const deletion = useEventDeletion(handleDeleted);
  // Day is the default: the hour-by-hour timeline is what this page is
  // for day to day, and the wider ranges are the step back you take
  // occasionally. Each view fetches only its own window, when opened.
  const [range, setRange] = useState<CalendarRange>("day");
  // What is being looked at, separate from how. Previously there was no such
  // state at all — the day view hardcoded `new Date()` and the month view
  // froze its own month at mount — which is why nothing on this page could
  // be navigated. Keeping one anchor also means switching range holds your
  // place instead of snapping back to today.
  const [anchor, setAnchor] = useState(() => new Date());
  const [editMode, setEditMode] = useState(false);

  // Week calendar events feed the AI task suggester in DayTasksPanel — the
  // same /api/calendar/week source /areas/time uses, so the two agree.
  const { data: weekCal } = useInsights<{ connected: boolean; events: WeekCalendarEvent[] }>(
    "/api/calendar/week",
    { connected: false, events: [] }
  );

  // Drilling in from a wider view moves both the range and the anchor, so
  // clicking the 14th of March lands on the 14th of March rather than on
  // today in day view.
  const openDay = useCallback((date: Date) => {
    setAnchor(date);
    setRange("day");
  }, []);
  const openMonth = useCallback((date: Date) => {
    setAnchor(date);
    setRange("month");
  }, []);

  // "Today" is only meaningful when you are not already looking at it — and
  // at week, month and year that means the range *containing* today, not the
  // date itself. Comparing dates directly would leave the button live while
  // viewing the current week from its Tuesday.
  const isToday = useMemo(() => isWithinRange(range, anchor, new Date()), [range, anchor]);
  const groups = data ? groupUpcomingEvents(data.events, new Date()) : [];

  // The copilot and agent panels still read the 14-day upcoming feed: they
  // reason about free time coming up, not about whichever day is on screen.
  const busy = (data?.events ?? []).map((e) => ({ start: e.start, end: e.end, title: e.title }));

  return (
    <main className="hero-gradient relative min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
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
        {data?.connected && (
          <details className="group rounded-2xl border border-hairline-card bg-surface-sunken/40 [&_summary]:list-none">
            <summary className="focus-ring flex cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 py-3.5">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles size={16} className="text-gold-ink" aria-hidden />
                הוסף לו״ז
              </span>
              <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="flex flex-col gap-5 px-4 pb-4">
              <CalendarAgentPanel busy={busy} onCreated={refresh} />
              <div className="border-t border-hairline-card pt-4">
                <ScheduleCopilotBar busy={busy} onScheduled={refresh} />
              </div>
            </div>
          </details>
        )}

        {data?.connected && (
          <GlassCard delay={0.1}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <p className="flex shrink-0 items-center gap-2 text-sm font-medium text-muted">
                  {range === "day" ? (
                    <Clock size={16} className="text-accent-career" aria-hidden />
                  ) : (
                    <CalendarDays size={16} className="text-accent-career" aria-hidden />
                  )}
                  <span className="truncate">{rangeLabel(range, anchor)}</span>
                </p>

                {/* ChevronRight steps back and ChevronLeft steps forward:
                    the page is RTL, so "earlier" is to the right. */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => setAnchor((current) => stepAnchor(range, current, -1))}
                    aria-label="הקודם"
                    className="glass-control-hover focus-ring grid size-7 place-items-center rounded-lg text-muted transition-colors hover:text-foreground"
                  >
                    <ChevronRight size={14} aria-hidden />
                  </button>
                  <button
                    onClick={() => setAnchor(new Date())}
                    disabled={isToday}
                    className="focus-ring rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    היום
                  </button>
                  <button
                    onClick={() => setAnchor((current) => stepAnchor(range, current, 1))}
                    aria-label="הבא"
                    className="glass-control-hover focus-ring grid size-7 place-items-center rounded-lg text-muted transition-colors hover:text-foreground"
                  >
                    <ChevronLeft size={14} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {range === "day" && (
                  <button
                    onClick={() => setEditMode((v) => !v)}
                    aria-pressed={editMode}
                    className={cn(
                      "focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      editMode
                        ? "border-gold-line bg-gold-soft text-gold-ink"
                        : "border-hairline-card text-muted hover:text-foreground"
                    )}
                  >
                    <Pencil size={12} aria-hidden />
                    {editMode ? "סיום עריכה" : "מצב עריכה"}
                  </button>
                )}
                <RangeTabs value={range} onChange={setRange} />
              </div>
            </div>

            {editMode && range === "day" && (
              <p className="mb-3 text-xs text-muted">
                החצים על כל אירוע מזיזים אותו ברבע שעה קדימה או אחורה. השינוי נשמר ביומן Google.
              </p>
            )}

            {range === "day" && <DayView anchor={anchor} chronotype={chronotype} editMode={editMode} />}
            {range === "week" && <WeekView anchor={anchor} />}
            {range === "month" && <MonthView anchor={anchor} onSelectDay={openDay} />}
            {range === "year" && <YearView anchor={anchor} onSelectMonth={openMonth} />}

            {range === "day" && !editMode && (
              <DayTasksPanel anchor={anchor} weekEvents={weekCal?.events ?? []} />
            )}
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
                  <li key={event.id} className="group flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-foreground/90">{event.title}</span>
                    <span className="ltr shrink-0 text-xs text-muted">
                      {formatEventTime(event.start)}–{formatEventTime(event.end)}
                    </span>
                    <DeleteEventButton event={event} onRequest={deletion.request} />
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

      <DeleteEventDialog
        event={deletion.pending}
        deleting={deletion.deleting}
        error={deletion.error}
        onCancel={deletion.cancel}
        onConfirm={deletion.confirm}
      />
    </main>
  );
}
