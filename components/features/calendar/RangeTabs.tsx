"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CALENDAR_RANGES, RANGE_LABELS, type CalendarRange } from "@/lib/calendar/ranges";
import { cn } from "@/lib/utils";

interface RangeTabsProps {
  value: CalendarRange;
  onChange: (range: CalendarRange) => void;
  /** Names the control for screen readers. */
  label?: string;
}

// Day / Week / Month / Year range selector.
//
// A button group, not a CSS radio hack: the sliding highlight is a
// framer-motion layout animation keyed to `value`, so it always lands on the
// button that React state actually says is active — the previous
// custom-property version could drift out of step and leave the pill stuck
// on "Day" after clicking "Year". role="radiogroup" + aria-checked keeps the
// grouping and state announced; arrow-key handling is added explicitly.
export function RangeTabs({ value, onChange, label = "טווח תצוגה" }: RangeTabsProps) {
  const groupId = useId();
  const reduce = useReducedMotion();
  const activeIndex = CALENDAR_RANGES.indexOf(value);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    // RTL: ArrowLeft advances, ArrowRight goes back.
    const dir = e.key === "ArrowLeft" ? 1 : -1;
    const next = (activeIndex + dir + CALENDAR_RANGES.length) % CALENDAR_RANGES.length;
    onChange(CALENDAR_RANGES[next]);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="relative isolate flex rounded-full border border-hairline bg-surface-sunken p-1"
    >
      {CALENDAR_RANGES.map((range) => {
        const active = value === range;
        return (
          <button
            key={range}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(range)}
            className={cn(
              "focus-ring relative z-10 min-w-[3.25rem] flex-1 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
              active ? "text-gold-ink" : "text-muted hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={`range-tabs-pill-${groupId}`}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 500, damping: 40, mass: 0.6 }
                }
                className="absolute inset-0 -z-10 rounded-full border border-gold-line bg-surface shadow-[0_1px_2px_rgba(16,16,20,0.08),0_0_18px_-10px_var(--gold)]"
              />
            )}
            <span className="relative">{RANGE_LABELS[range]}</span>
          </button>
        );
      })}
    </div>
  );
}
