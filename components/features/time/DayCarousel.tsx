"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DayOption {
  dateKey: string; // "YYYY-MM-DD", local
  label: string; // "היום" | "מחר" | "יום ג'"
  dayNumber: string; // "24/07"
}

const HEBREW_WEEKDAYS = ["יום א'", "יום ב'", "יום ג'", "יום ד'", "יום ה'", "יום ו'", "שבת"];

// Exported so the parent page can compute "today"'s key with the exact
// same logic used to build the carousel's own day keys — a mismatch here
// (e.g. one side using toISOString(), which is UTC, not local) would
// silently break the isToday-gated "Anytime" undated-tasks block.
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDayOptions(daysCount: number): DayOption[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: daysCount }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const label = i === 0 ? "היום" : i === 1 ? "מחר" : HEBREW_WEEKDAYS[date.getDay()];
    return {
      dateKey: toDateKey(date),
      label,
      dayNumber: date.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }),
    };
  });
}

interface DayCarouselProps {
  selectedDate: string;
  onSelect: (dateKey: string) => void;
}

// The Time & Tasks Space's day switcher — a 7-day horizontal strip (the
// same window app/api/calendar/week fetches) with a sliding active pill,
// same layoutId-animated-background mechanic Sidebar's NavLink and
// TorahTabs already use, just in --accent-time. overscroll-x-contain
// keeps a horizontal swipe from bubbling into the page's own vertical
// scroll/bounce on mobile.
export function DayCarousel({ selectedDate, onSelect }: DayCarouselProps) {
  const days = buildDayOptions(7);

  return (
    <div className="mb-6 overflow-x-auto overscroll-x-contain pb-1" role="tablist" aria-label="בחירת יום">
      <div className="flex w-max gap-2">
        {days.map((day) => {
          const isActive = day.dateKey === selectedDate;
          return (
            <button
              key={day.dateKey}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(day.dateKey)}
              className={cn(
                "focus-ring relative flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-2xl px-3 py-2.5 text-center transition-colors",
                isActive ? "text-accent-time" : "text-muted hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="time-day-active"
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--accent-time) 22%, transparent), color-mix(in srgb, var(--accent-time) 6%, transparent))",
                    border: "1px solid color-mix(in srgb, var(--accent-time) 35%, transparent)",
                    boxShadow: "0 0 24px -8px color-mix(in srgb, var(--accent-time) 55%, transparent)",
                  }}
                />
              )}
              <span className="relative text-xs font-medium">{day.label}</span>
              <span className="ltr relative text-[11px] text-muted">{day.dayNumber}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
