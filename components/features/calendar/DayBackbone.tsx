"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Clock3, LayoutList } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import {
  ROUTINE_KIND_COLOR_VAR,
  ROUTINE_KIND_LABELS,
  blocksForDay,
  currentBlock,
  formatDuration,
  formatMinute,
  nextBlock,
} from "@/lib/schedule/routine";
import { cn } from "@/lib/utils";

const TICK_MS = 60_000;

interface DayBackboneProps {
  /** The day the calendar is showing. */
  anchor: Date;
  /** Opens the weekly-skeleton editor (a tab on the same page). */
  onEdit: () => void;
}

// The daily backbone — the user's recurring routine for this weekday, shown
// as a compact single-line strip above the timeline. On today it also calls
// out the current block and what's next; on other days it's just the shape of
// that day. Collapsed by default so it costs one row until you want it.
export function DayBackbone({ anchor, onEdit }: DayBackboneProps) {
  const routineBlocks = useAtlasStore((s) => s.routineBlocks);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const weekday = anchor.getDay();
  const isToday = now
    ? anchor.getFullYear() === now.getFullYear() &&
      anchor.getMonth() === now.getMonth() &&
      anchor.getDate() === now.getDate()
    : false;

  const dayBlocks = useMemo(() => blocksForDay(routineBlocks, weekday), [routineBlocks, weekday]);

  const live = useMemo(() => {
    if (!isToday || !now) return null;
    const minute = now.getHours() * 60 + now.getMinutes();
    const current = currentBlock(routineBlocks, weekday, minute);
    const next = nextBlock(routineBlocks, weekday, minute, (weekday + 1) % 7);
    return {
      current,
      minutesLeft: current ? current.endMinute - minute : null,
      next,
    };
  }, [isToday, now, routineBlocks, weekday]);

  if (dayBlocks.length === 0) {
    return (
      <button
        onClick={onEdit}
        className="focus-ring mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-hairline-card px-3 py-2 text-start text-xs text-muted transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <LayoutList size={13} aria-hidden />
          עוד אין שלד יומי — בנה אותו כדי שהאפליקציה תדע מה עכשיו ומתי אתה פנוי
        </span>
        <span className="shrink-0 text-gold-ink">בנה</span>
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-hairline-card bg-surface-sunken/50">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start"
      >
        <span className="flex min-w-0 items-center gap-2 text-xs">
          <Clock3 size={13} className="shrink-0 text-accent-time" aria-hidden />
          {live?.current ? (
            <span className="min-w-0 truncate text-foreground">
              עכשיו: <span className="font-medium">{live.current.title || ROUTINE_KIND_LABELS[live.current.kind]}</span>
              {live.minutesLeft != null && live.minutesLeft > 0 && (
                <span className="text-muted"> · עוד {formatDuration(live.minutesLeft)}</span>
              )}
            </span>
          ) : live?.next ? (
            <span className="min-w-0 truncate text-muted">
              הבא: <span className="text-foreground">{live.next.block.title || ROUTINE_KIND_LABELS[live.next.block.kind]}</span>
              {" · "}
              {live.next.isTomorrow ? "מחר" : `בעוד ${formatDuration(live.next.minutesUntil)}`}
            </span>
          ) : (
            <span className="truncate text-muted">שלד היום · {dayBlocks.length} בלוקים</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="flex flex-wrap gap-1.5 border-t border-hairline-card px-3 py-2.5">
          {dayBlocks.map((block) => {
            const isCurrent = live?.current?.id === block.id;
            const accent = ROUTINE_KIND_COLOR_VAR[block.kind];
            return (
              <span
                key={block.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[0.7rem]",
                  isCurrent ? "font-medium" : "text-muted"
                )}
                style={{
                  borderColor: `color-mix(in srgb, var(${accent}) ${isCurrent ? 55 : 25}%, transparent)`,
                  background: `color-mix(in srgb, var(${accent}) ${isCurrent ? 14 : 6}%, transparent)`,
                  color: isCurrent ? `color-mix(in srgb, var(${accent}) 85%, var(--foreground))` : undefined,
                }}
              >
                <span className="ltr tabular-nums">{formatMinute(block.startMinute)}</span>
                <span className="truncate">{block.title || ROUTINE_KIND_LABELS[block.kind]}</span>
              </span>
            );
          })}
          <button
            onClick={onEdit}
            className="focus-ring rounded-lg px-2 py-1 text-[0.7rem] text-gold-ink transition-colors hover:opacity-80"
          >
            עריכת השלד
          </button>
        </div>
      )}
    </div>
  );
}
