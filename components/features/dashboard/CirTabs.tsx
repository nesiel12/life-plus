"use client";

import { Fragment, useId } from "react";
import { cn } from "@/lib/utils";

interface CirTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  /** Names the control for screen readers. */
  label: string;
  className?: string;
}

// The generic form of RangeTabs.tsx's cir-tabs control — same markup, same
// role="radiogroup" reasoning (a <label> isn't a tab; the radios underneath
// already are a radiogroup, with free arrow-key nav and checked-state
// announcement), same useId-scoped group so two instances on one page never
// fight over which is checked. RangeTabs itself is untouched (it's hardcoded
// to CalendarRange, one call site, no reason to migrate it); this exists for
// SecondaryZone.tsx's 5-way window selector and any future non-4-item use —
// --cir-count is published so the sliding indicator (app/globals.css) sizes
// itself to however many options there are, not just 4.
export function CirTabs<T extends string>({ value, onChange, options, label, className }: CirTabsProps<T>) {
  const groupId = useId();
  const activeIndex = options.findIndex((option) => option.value === value);

  return (
    <div
      className={cn("cir-tabs", className)}
      role="radiogroup"
      aria-label={label}
      style={{ "--cir-index": activeIndex, "--cir-count": options.length } as React.CSSProperties}
    >
      {options.map((option) => {
        const id = `${groupId}-${option.value}`;
        return (
          <Fragment key={option.value}>
            <input
              className="cir-tabs__r"
              type="radio"
              name={`cir-${groupId}`}
              id={id}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <label className="cir-tabs__t" htmlFor={id}>
              {option.label}
            </label>
          </Fragment>
        );
      })}
    </div>
  );
}
