"use client";

import type { ReactNode } from "react";
import {
  Apple,
  Bell,
  Briefcase,
  Calendar,
  CalendarPlus,
  Check,
  Dumbbell,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { cn } from "@/lib/utils";
import { momentCategoryColorVar, momentCategoryLabel } from "@/lib/lifeAreas";
import { DailyRecommendations } from "@/components/features/time/DailyRecommendations";
import { HabitsSection } from "@/components/features/time/HabitsSection";
import type { TimelineRowData, WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import type { MealType, Person, Task, Transaction } from "@/types";

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "ארוחת בוקר",
  lunch: "ארוחת צהריים",
  dinner: "ארוחת ערב",
  snack: "חטיף",
  "post-workout": "לאחר אימון",
};

interface TimelineProps {
  rows: TimelineRowData[];
  onToggleTaskDone: (task: Task) => void;
  onDeleteManualEvent: (eventId: string) => void;
  selectedDate: string;
  isToday: boolean;
  openEvents: WeekCalendarEvent[];
  openTasks: Task[];
  shifts: Transaction[];
  people: Person[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatReminderLabel(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "יום לפני" : `${days} ימים לפני`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "שעה לפני" : `${hours} שעות לפני`;
  }
  return `${minutes} דק' לפני`;
}

// The RTL vertical spine + node dots: under dir="rtl", a flex row's first
// DOM child renders at the right edge (the inline/main axis follows
// direction), so putting the gutter (line + dot) first and the content
// card second places the line on the right with zero absolute
// positioning for the cards themselves — only the continuous line itself
// needs one absolutely-positioned element, spanning the whole list.
// accentVar lets each row kind's node dot match its own card's ring color
// (finance-green for a shift, fitness-coral for a meal/workout) instead of
// every dot reading as generic --accent-time regardless of what the row
// actually is — a small change that makes the spine itself carry meaning.
function TimelineRow({
  time,
  accentVar = "--accent-time",
  children,
}: {
  time?: string | null;
  accentVar?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="flex w-6 shrink-0 flex-col items-center gap-1 pt-1.5">
        {time && <span className="ltr text-[10px] font-medium leading-none text-muted">{time}</span>}
        <span
          className="size-[9px] shrink-0 rounded-full ring-4 ring-background"
          style={{ backgroundColor: `var(${accentVar})`, boxShadow: `0 0 8px -1px var(${accentVar})` }}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1 pb-0.5">{children}</div>
    </div>
  );
}

function greetingByHour(hour: number): { label: string; Icon: LucideIcon } {
  if (hour >= 5 && hour < 12) return { label: "בוקר טוב", Icon: Sunrise };
  if (hour >= 12 && hour < 17) return { label: "צהריים טובים", Icon: Sun };
  if (hour >= 17 && hour < 21) return { label: "ערב טוב", Icon: Sunset };
  return { label: "לילה טוב", Icon: Moon };
}

// The Timeline's own personalized header — a time-of-day greeting when
// looking at today (real clock time, not the selected date), or the day's
// name/date when browsing another day in the carousel, plus a one-line
// natural-language summary of the day's real load built from the same
// rows/shifts data already merged into the timeline. Purely derived, no
// extra fetch — everything here is already in props by the time this
// renders.
function TimelineHeader({
  rows,
  shifts,
  isToday,
  selectedDate,
}: {
  rows: TimelineRowData[];
  shifts: Transaction[];
  isToday: boolean;
  selectedDate: string;
}) {
  const { label, Icon } = isToday
    ? greetingByHour(new Date().getHours())
    : { label: new Date(selectedDate).toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit" }), Icon: Calendar };

  const eventsCount = rows.filter((r) => r.kind === "event").length + rows.filter((r) => r.kind === "manual-event").length;
  const openTasksCount = rows.filter((r) => r.kind === "task" && r.task.status !== "done").length;
  const workoutsCount = rows.filter((r) => r.kind === "workout").length;
  const mealsCount = rows.filter((r) => r.kind === "meal").length;
  const totalShiftHours = shifts.reduce((sum, t) => {
    if (!t.shiftStart || !t.shiftEnd) return sum;
    return sum + (new Date(t.shiftEnd).getTime() - new Date(t.shiftStart).getTime()) / 3_600_000;
  }, 0);

  const parts: string[] = [];
  if (eventsCount > 0) parts.push(`${eventsCount} ${eventsCount === 1 ? "פגישה" : "פגישות"}`);
  if (openTasksCount > 0) parts.push(`${openTasksCount} ${openTasksCount === 1 ? "משימה" : "משימות"}`);
  if (totalShiftHours > 0) parts.push(`משמרת של ${Math.round(totalShiftHours * 10) / 10} שעות`);
  if (workoutsCount > 0) parts.push(`${workoutsCount} ${workoutsCount === 1 ? "אימון" : "אימונים"}`);
  if (mealsCount > 0) parts.push(`${mealsCount} ${mealsCount === 1 ? "ארוחה נרשמה" : "ארוחות נרשמו"}`);

  const summary = parts.length > 0 ? parts.join(" · ") : "אין עדיין פריטים מתוכננים ליום הזה.";

  return (
    <div className="mb-5 flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-time/10 text-accent-time">
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="gradient-text truncate text-lg font-semibold tracking-tight">{label}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{summary}</p>
      </div>
    </div>
  );
}

export function Timeline({
  rows,
  onToggleTaskDone,
  onDeleteManualEvent,
  selectedDate,
  isToday,
  openEvents,
  openTasks,
  shifts,
  people,
}: TimelineProps) {
  return (
    <div className="relative">
      <TimelineHeader rows={rows} shifts={shifts} isToday={isToday} selectedDate={selectedDate} />
      <div className="relative">
        {/* A soft top/bottom fade instead of a flat line — the same
            color-mix/gradient idiom the rest of this app's Liquid Glass
            surfaces already use, so the spine reads as part of that system
            rather than a plain HTML divider. */}
        <div
          className="absolute inset-y-0 right-[11px] w-px"
          style={{
            background: "linear-gradient(180deg, transparent, var(--glass-border) 8%, var(--glass-border) 92%, transparent)",
          }}
          aria-hidden
        />
        <div className="flex flex-col gap-3.5">
          {rows.map((row, i) => {
            const delay = Math.min(i * 0.04, 0.4);

            if (row.kind === "event") {
              return (
                <TimelineRow key={row.id} time={row.time ?? "כל היום"}>
                  <GlassCard delay={delay} className="p-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="shrink-0 text-accent-time" aria-hidden />
                      <span className="truncate text-sm text-foreground">{row.event.title}</span>
                    </div>
                  </GlassCard>
                </TimelineRow>
              );
            }

            if (row.kind === "task") {
              const isDone = row.task.status === "done";
              return (
                <TimelineRow key={row.id} time={row.time}>
                  <GlassCard delay={delay} className={cn("p-3", row.task.isHighPriority && "ring-1 ring-accent-time/50")}>
                    <button
                      onClick={() => onToggleTaskDone(row.task)}
                      aria-label={isDone ? `סמן את "${row.task.title}" כלא בוצע` : `סמן את "${row.task.title}" כבוצע`}
                      className="focus-ring flex w-full items-center gap-2 text-start"
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                          isDone
                            ? "border-accent-time bg-accent-time/20 text-accent-time"
                            : "border-glass-border text-transparent"
                        )}
                      >
                        <Check size={10} aria-hidden />
                      </span>
                      <span className={cn("truncate text-sm", isDone ? "text-muted line-through" : "text-foreground")}>
                        {row.task.title}
                      </span>
                    </button>
                  </GlassCard>
                </TimelineRow>
              );
            }

            if (row.kind === "manual-event") {
              // Manual (user-created) events: rendered distinctly from
              // Google Calendar events — a category chip (the app's own
              // life-area vocabulary), linked-contact avatars, and a
              // reminder chip when set, plus a delete affordance since this
              // data is user-owned (unlike Google Calendar events, which
              // are read-only here).
              const event = row.manualEvent;
              const linkedPeople = people.filter((p) => event.linkedContactIds.includes(p.id));
              const categoryColorVar = event.category ? momentCategoryColorVar(event.category) : null;
              const hasMeta = Boolean(event.category) || linkedPeople.length > 0 || Boolean(event.reminderMinutes);

              return (
                <TimelineRow key={row.id} time={row.time}>
                  <GlassCard delay={delay} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <CalendarPlus size={14} className="shrink-0 text-accent-time" aria-hidden />
                          <span className="truncate text-sm font-medium text-foreground">{event.title}</span>
                        </div>
                        <p className="ltr mt-0.5 text-xs text-muted">
                          {formatTime(event.startTime)}–{formatTime(event.endTime)}
                        </p>
                      </div>
                      <button
                        onClick={() => onDeleteManualEvent(event.id)}
                        aria-label={`מחק את ${event.title}`}
                        className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>

                    {hasMeta && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {event.category && categoryColorVar && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px]"
                            style={{
                              backgroundColor: `color-mix(in srgb, var(${categoryColorVar}) 18%, transparent)`,
                              color: `var(${categoryColorVar})`,
                            }}
                          >
                            {momentCategoryLabel(event.category)}
                          </span>
                        )}
                        {event.reminderMinutes && (
                          <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">
                            <Bell size={10} aria-hidden />
                            {formatReminderLabel(event.reminderMinutes)}
                          </span>
                        )}
                        {linkedPeople.map((person) => (
                          <span
                            key={person.id}
                            className="flex items-center gap-1 rounded-full bg-white/5 py-0.5 ps-0.5 pe-2 text-[10px] text-foreground/80"
                          >
                            <PersonAvatar person={person} size={14} />
                            {person.hebrewName ?? person.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                </TimelineRow>
              );
            }

            if (row.kind === "shift") {
              // Work shifts (Finances Pro): a Transaction with is_shift=true,
              // rendered with its own ring tint (the app's money-green accent)
              // to read as distinct from a plain calendar event — employer +
              // time range, plus the computed amount and hourly rate as chips.
              const transaction = row.transaction;
              return (
                <TimelineRow key={row.id} time={row.time} accentVar="--accent-finance">
                  <GlassCard delay={delay} className="p-3 ring-1 ring-accent-finance/40">
                    <div className="flex items-center gap-2">
                      <Briefcase size={14} className="shrink-0 text-accent-finance" aria-hidden />
                      <span className="truncate text-sm font-medium text-foreground">
                        {transaction.employer ? `משמרת אצל ${transaction.employer}` : transaction.title}
                      </span>
                    </div>
                    {transaction.shiftStart && transaction.shiftEnd && (
                      <p className="ltr mt-0.5 text-xs text-muted">
                        {formatTime(transaction.shiftStart)}–{formatTime(transaction.shiftEnd)}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-accent-finance/15 px-2 py-0.5 text-[10px] text-accent-finance">
                        {formatAmount(transaction.amount)} ₪
                      </span>
                      {transaction.hourlyRate && (
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">
                          {transaction.hourlyRate} ₪/שעה
                        </span>
                      )}
                    </div>
                  </GlassCard>
                </TimelineRow>
              );
            }

            if (row.kind === "meal") {
              // Health & Fitness Space (Phase 8): a logged meal, its own
              // coral/orange ring (--accent-fitness) to read as visually
              // distinct from tasks (cyan) and shifts (money green) — a type
              // chip (breakfast/lunch/dinner/snack/post-workout) is the only
              // other real data a meal carries.
              const meal = row.meal;
              return (
                <TimelineRow key={row.id} time={row.time} accentVar="--accent-fitness">
                  <GlassCard delay={delay} className="p-3 ring-1 ring-accent-fitness/40">
                    <div className="flex items-center gap-2">
                      <Apple size={14} className="shrink-0 text-accent-fitness" aria-hidden />
                      <span className="truncate text-sm font-medium text-foreground">{meal.description}</span>
                    </div>
                    <span className="mt-2 inline-block rounded-full bg-accent-fitness/15 px-2 py-0.5 text-[10px] text-accent-fitness">
                      {MEAL_TYPE_LABEL[meal.type]}
                    </span>
                  </GlassCard>
                </TimelineRow>
              );
            }

            // Health & Fitness Space (Phase 8): a logged workout, same
            // --accent-fitness ring as a meal (both are "Health data" on this
            // shared timeline) but its own icon (Dumbbell) — time range and
            // routine details render only when present, same "don't invent a
            // field that wasn't given" convention every other row here follows.
            const workout = row.workout;
            return (
              <TimelineRow key={row.id} time={row.time} accentVar="--accent-fitness">
                <GlassCard delay={delay} className="p-3 ring-1 ring-accent-fitness/40">
                  <div className="flex items-center gap-2">
                    <Dumbbell size={14} className="shrink-0 text-accent-fitness" aria-hidden />
                    <span className="truncate text-sm font-medium text-foreground">{workout.title}</span>
                  </div>
                  {workout.endTime && (
                    <p className="ltr mt-0.5 text-xs text-muted">
                      {formatTime(workout.startTime)}–{formatTime(workout.endTime)}
                    </p>
                  )}
                  {workout.routineDetails && (
                    <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">{workout.routineDetails}</p>
                  )}
                </GlassCard>
              </TimelineRow>
            );
          })}

          {/* Habits and AI Recommendations are real features, not rows
              emitted by buildDailyTimelineRows — they render directly here,
              still wrapped in the same gutter to keep the spine continuous. */}
          <TimelineRow>
            <HabitsSection selectedDate={selectedDate} />
          </TimelineRow>
          <TimelineRow>
            <DailyRecommendations dateKey={selectedDate} events={openEvents} tasks={openTasks} shifts={shifts} />
          </TimelineRow>
        </div>
      </div>
    </div>
  );
}
