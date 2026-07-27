"use client";

import { motion } from "framer-motion";
import { AlertCircle, CalendarClock, Coffee, Heart, Sparkles, type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";
import { useAtlasStore } from "@/store/useAtlasStore";
import type { WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import type { DailyRecommendation, DailyRecommendationIcon, Task, Transaction } from "@/types";

const ICONS: Record<DailyRecommendationIcon, LucideIcon> = {
  coffee: Coffee,
  heart: Heart,
  "alert-circle": AlertCircle,
  "calendar-clock": CalendarClock,
};

interface RawRecommendation {
  title: string;
  message: string;
  icon_name: DailyRecommendationIcon;
}

interface DailyRecommendationsProps {
  dateKey: string;
  events: WeekCalendarEvent[];
  tasks: Task[];
  shifts: Transaction[];
}

// Replaces the Timeline's old static "AI Recommendations — coming soon"
// row. Results are cached in useAtlasStore's dailyRecommendations by date
// key, so swiping the Day Carousel away and back to an already-analyzed
// day shows the cached result instantly instead of re-calling the AI.
export function DailyRecommendations({ dateKey, events, tasks, shifts }: DailyRecommendationsProps) {
  const cached = useAtlasStore((s) => s.dailyRecommendations[dateKey]);
  const setDailyRecommendations = useAtlasStore((s) => s.setDailyRecommendations);
  const personalDNA = useAtlasStore((s) => s.personalDNA);
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);

  const { loading, error, run: analyze } = useApiCall(async () => {
    const res = await fetch("/api/ai/daily-recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          start_time: e.start_time,
          end_time: e.end_time,
          is_all_day: e.is_all_day,
        })),
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          dueDate: t.dueDate,
          status: t.status,
        })),
        // Finances Pro: Work & Shifts — the day's real work shift(s), if
        // any, so the AI can explicitly reason about a long/hard work day.
        shifts: shifts
          .filter((t) => t.shiftStart && t.shiftEnd)
          .map((t) => ({
            employer: t.employer,
            hourlyRate: t.hourlyRate,
            startTime: t.shiftStart as string,
            endTime: t.shiftEnd as string,
          })),
        // Real data only — the user's own personalDNA and their own
        // real upcoming events (upcoming_events table), never a fixed or
        // invented personal narrative.
        context: {
          peakFocusHours: personalDNA.peakFocusHours,
          upcomingEvents: upcomingEvents
            .filter((e) => e.date >= dateKey)
            .slice(0, 5)
            .map((e) => ({ title: e.title, date: e.date })),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "הניתוח נכשל. נסה שוב.");

    const recommendations: DailyRecommendation[] = ((data.recommendations ?? []) as RawRecommendation[]).map((r) => ({
      title: r.title,
      message: r.message,
      iconName: r.icon_name,
    }));
    setDailyRecommendations(dateKey, recommendations);
  });

  function handleAnalyze() {
    if (loading) return;
    analyze().catch(() => {
      // error is already captured for display below
    });
  }

  if (loading) {
    return (
      <GlassCard className="flex items-center justify-center gap-3 py-5">
        <motion.div
          animate={{
            boxShadow: [
              "0 0 20px -6px color-mix(in srgb, var(--accent-time) 45%, transparent)",
              "0 0 44px -6px color-mix(in srgb, var(--accent-time) 75%, transparent)",
              "0 0 20px -6px color-mix(in srgb, var(--accent-time) 45%, transparent)",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-time/10"
        >
          <Sparkles size={16} className="text-accent-time" aria-hidden />
        </motion.div>
        <p className="text-sm text-muted">מנתח את העומס של היום…</p>
      </GlassCard>
    );
  }

  if (cached && cached.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {cached.map((rec, i) => {
          const Icon = ICONS[rec.iconName];
          return (
            <GlassCard key={i} className="p-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-time/15 text-accent-time">
                  <Icon size={14} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{rec.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-foreground/70">{rec.message}</p>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={handleAnalyze}
        className="focus-ring flex w-full items-center gap-2 rounded-2xl border border-dashed border-accent-time/40 bg-accent-time/5 px-3 py-2.5 text-sm text-accent-time transition-colors hover:bg-accent-time/10"
      >
        <Sparkles size={14} className="shrink-0" aria-hidden />
        נתח את העומס להיום
      </button>
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </div>
  );
}
