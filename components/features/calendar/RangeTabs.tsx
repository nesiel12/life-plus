"use client";

import { Fragment, useId } from "react";
import { CALENDAR_RANGES, RANGE_LABELS, type CalendarRange } from "@/lib/calendar/ranges";

interface RangeTabsProps {
  value: CalendarRange;
  onChange: (range: CalendarRange) => void;
  /** Names the control for screen readers. */
  label?: string;
}

// The cir-tabs range selector — Day / Week / Month / Year.
//
// The specified markup is kept as given: a .cir-tabs container holding a
// .cir-tabs__r radio and a .cir-tabs__t label per range, with the label's
// `for` pointing at its radio. That structure is what the CSS in globals.css
// hangs off, and it is what makes the control work: the checked radio styles
// its own label through a sibling selector, and clicking a label activates
// its radio natively.
//
// Two deliberate departures from the snippet:
//
//  1. `role="tablist"` / `role="tab"` are dropped. A <label> is not a tab —
//     giving it that role overrides its real semantics, and a tab is
//     expected to be focusable and to carry aria-selected, which a label is
//     not and does not. Meanwhile the radios underneath already form exactly
//     the right thing: a radiogroup, with arrow-key navigation and
//     checked-state announcement that browsers implement for free. The
//     container is marked role="radiogroup" so that grouping is announced;
//     the visual result is identical.
//
//  2. Ids and the group name come from useId rather than the literal
//     "cir-range" / "cir-r-day". Two of these on one page — a header and a
//     mobile bar, say — would otherwise share a radio group and fight over
//     which is checked, and duplicate ids would send every label to the
//     first instance's inputs.
//
// The active index is published as a custom property rather than derived in
// CSS with :has(), so the sliding indicator needs no selector support and
// stays exactly in step with the React state that actually owns the value.
export function RangeTabs({ value, onChange, label = "טווח תצוגה" }: RangeTabsProps) {
  const groupId = useId();
  const activeIndex = CALENDAR_RANGES.indexOf(value);

  return (
    <div
      className="cir-tabs"
      role="radiogroup"
      aria-label={label}
      style={{ "--cir-index": activeIndex } as React.CSSProperties}
    >
      {CALENDAR_RANGES.map((range) => {
        const id = `${groupId}-${range}`;
        // Flat, exactly as specified: the input and its label are direct
        // siblings of the container, which is what lets the checked radio
        // style its own label with a plain `+` selector and no wrapper.
        return (
          <Fragment key={range}>
            <input
              className="cir-tabs__r"
              type="radio"
              name={`cir-range-${groupId}`}
              id={id}
              checked={value === range}
              onChange={() => onChange(range)}
            />
            <label className="cir-tabs__t" htmlFor={id}>
              {RANGE_LABELS[range]}
            </label>
          </Fragment>
        );
      })}
    </div>
  );
}
