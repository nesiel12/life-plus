"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { signIn } from "next-auth/react";
import { CalendarClock, CalendarDays, CalendarRange as CalendarRangeIcon, ChevronDown, ChevronLeft, ChevronRight, Clock, Pencil, Sparkles } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { DayView } from "@/components/features/calendar/DayView";
import { WeekView } from "@/components/features/calendar/WeekView";
import { YearView } from "@/components/features/calendar/YearView";
import { RangeTabs } from "@/components/features/calendar/RangeTabs";
import { CalendarAgentPanel } from "@/components/features/calendar/CalendarAgentPanel";
import { MonthView } from "@/components/features/calendar/MonthView";
import { ScheduleCopilotBar } from "@/components/features/calendar/ScheduleCopilotBar";
import { CalendarTasksSection } from "@/components/features/calendar/CalendarTasksSection";
import { DayBackbone } from "@/components/features/calendar/DayBackbone";
import { ClearCalendarButton } from "@/components/features/calendar/ClearCalendarButton";
import { WeeklySchedule } from "@/components/features/schedule/WeeklySchedule";
import type { WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import { useInsights } from "@/hooks/useInsights";
import { isWithinRange, rangeLabel, stepAnchor, type CalendarRange } from "@/lib/calendar/ranges";
import type { GoogleCalendarEvent } from "@/lib/googleCalendar/fetchEvents";
import { BackToHome } from "@/components/layout/BackToHome";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";

interface UpcomingResponse {
  connected: boolean;
  events: GoogleCalendarEvent[];
}

const FALLBACK: UpcomingResponse = { connected: false, events: [] };

// The unified Calendar & Tasks screen. The day view stacks: the daily
// backbone (recurring routine), the hour-by-hour timeline with free-time
// gaps, then the full tasks / habits / suggestions section that used to be
// its own /areas/time page. The weekly-skeleton editor lives in a
// collapsible at the bottom.
export default function CalendarPage() {
  const t = useT();
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const { data, refresh } = useInsights<UpcomingResponse>("/api/calendar/upcoming", FALLBACK);

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

  // Week calendar events feed the AI task suggester in CalendarTasksSection —
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
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{t("page.calendar.title")}</h1>
        <p className="mt-2 text-muted">{t("page.calendar.subtitle")}</p>
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

              {/* flex-wrap, like the row that holds this one: the three
                  controls together are wider than a phone, and without it
                  RangeTabs (4 × min-w-[3.25rem]) pushed the group 36px past
                  the inline-start edge, where the page clipped it. */}
              <div className="flex flex-wrap items-center gap-2">
                <ClearCalendarButton anchor={anchor} onCleared={refresh} />
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

            {range === "day" && !editMode && (
              <DayBackbone anchor={anchor} onEdit={() => setWeeklyOpen(true)} />
            )}

            {range === "day" && <DayView anchor={anchor} chronotype={chronotype} editMode={editMode} />}
            {range === "week" && <WeekView anchor={anchor} />}
            {range === "month" && <MonthView anchor={anchor} onSelectDay={openDay} />}
            {range === "year" && <YearView anchor={anchor} onSelectMonth={openMonth} />}

            {range === "day" && !editMode && (
              <CalendarTasksSection
                anchor={anchor}
                weekEvents={weekCal?.events ?? []}
                calendarConnected={Boolean(weekCal?.connected)}
                onEventCreated={refresh}
              />
            )}
          </GlassCard>
        )}

        {data && !data.connected && (
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
        )}

        <details
          className="group rounded-2xl border border-hairline-card bg-surface-sunken/40 [&_summary]:list-none"
          open={weeklyOpen}
          onToggle={(e) => setWeeklyOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="focus-ring flex cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 py-3.5">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarRangeIcon size={16} className="text-accent-time" aria-hidden />
              שלד הלו״ז השבועי
            </span>
            <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-4 pb-4">
            <p className="mb-4 text-xs text-muted">
              הבלוקים הקבועים של השבוע — עבודה, לימודים, אימון, מנוחה. על בסיסם האפליקציה יודעת מה עכשיו,
              מה הבא, ומתי אתה באמת פנוי, ושולחת התראות לפני כל מעבר.
            </p>
            <WeeklySchedule />
          </div>
        </details>
      </div>

    </main>
  );
}
