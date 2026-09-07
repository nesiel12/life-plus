"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { ScheduleImportPanel } from "@/components/features/schedule/ScheduleImportPanel";
import {
  ROUTINE_KIND_COLOR_VAR,
  ROUTINE_KIND_LABELS,
  WEEKDAY_INITIALS,
  WEEKDAY_LABELS,
  blocksForDay,
  bookedMinutes,
  formatDuration,
  formatMinute,
  freeWindows,
  parseMinute,
  type RoutineBlock,
  type RoutineKind,
} from "@/lib/schedule/routine";
import type { RoutineBlockInput } from "@/app/actions/routineBlocks";
import { cn } from "@/lib/utils";

const KINDS: RoutineKind[] = [
  "work",
  "study",
  "torah",
  "training",
  "rest",
  "meal",
  "commute",
  "family",
  "free",
  "other",
];

interface DraftState {
  id: string | null;
  title: string;
  kind: RoutineKind;
  weekdays: number[];
  start: string;
  end: string;
  note: string;
}

function emptyDraft(weekday: number): DraftState {
  return {
    id: null,
    title: "",
    kind: "study",
    weekdays: [weekday],
    start: "09:00",
    end: "10:00",
    note: "",
  };
}

function draftFrom(block: RoutineBlock): DraftState {
  return {
    id: block.id,
    title: block.title,
    kind: block.kind,
    weekdays: [...block.weekdays],
    start: formatMinute(block.startMinute),
    end: formatMinute(block.endMinute),
    note: block.note ?? "",
  };
}

/**
 * The weekly skeleton: what a normal week looks like.
 *
 * A day-column list rather than a drag-and-drop grid. The information that
 * matters is "what is on each day and how much of it is spoken for", and a
 * pixel-positioned grid on a phone makes a 30-minute block a 6px target. Times
 * are typed, which is faster than dragging anyway once you know the answer.
 */
export function WeeklySchedule() {
  const blocks = useAtlasStore((s) => s.routineBlocks);
  const addBlock = useAtlasStore((s) => s.addRoutineBlock);
  const updateBlock = useAtlasStore((s) => s.updateRoutineBlock);
  const deleteBlock = useAtlasStore((s) => s.deleteRoutineBlock);

  const [selectedDay, setSelectedDay] = useState(() => new Date().getDay());
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const dayBlocks = useMemo(() => blocksForDay(blocks, selectedDay), [blocks, selectedDay]);
  const booked = useMemo(() => bookedMinutes(blocks, selectedDay), [blocks, selectedDay]);
  const gaps = useMemo(
    () => freeWindows(blocks, selectedDay, { fromMinute: 6 * 60, toMinute: 23 * 60, minDurationMinutes: 45 }),
    [blocks, selectedDay]
  );

  // How many blocks each weekday carries, so the day picker shows where the
  // week is heavy without opening each day.
  const countByDay = useMemo(
    () => WEEKDAY_INITIALS.map((_, day) => blocksForDay(blocks, day).length),
    [blocks]
  );

  async function submit() {
    if (!draft) return;
    const startMinute = parseMinute(draft.start);
    const endMinute = parseMinute(draft.end);

    if (!draft.title.trim()) return setError("צריך שם לבלוק.");
    if (startMinute === null) return setError("שעת התחלה לא תקינה. פורמט: 09:00");
    if (endMinute === null) return setError("שעת סיום לא תקינה. פורמט: 10:30");
    if (endMinute <= startMinute) {
      return setError("שעת הסיום חייבת להיות אחרי ההתחלה. בלוק שחוצה חצות — פצל לשניים.");
    }
    if (draft.weekdays.length === 0) return setError("בחר לפחות יום אחד.");

    const input: RoutineBlockInput = {
      title: draft.title.trim(),
      kind: draft.kind,
      weekdays: draft.weekdays,
      startMinute,
      endMinute,
      note: draft.note.trim() || undefined,
    };

    setSaving(true);
    setError(null);
    try {
      if (draft.id) {
        await updateBlock(draft.id, { ...input, note: input.note ?? "" });
      } else {
        await addBlock(input);
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את הבלוק.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ScheduleImportPanel />

      {/* Day picker */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="ימי השבוע">
        {WEEKDAY_LABELS.map((label, day) => (
          <button
            key={day}
            role="tab"
            aria-selected={selectedDay === day}
            onClick={() => {
              setSelectedDay(day);
              setDraft(null);
            }}
            className={cn(
              "focus-ring flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
              selectedDay === day
                ? "border-gold-line bg-gold-soft font-medium text-gold-ink"
                : "border-hairline-card text-muted hover:text-foreground"
            )}
          >
            {label}
            {countByDay[day] > 0 && (
              <span className="ltr text-[0.65rem] tabular-nums opacity-70">{countByDay[day]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          {dayBlocks.length === 0
            ? "אין בלוקים ביום הזה."
            : `${dayBlocks.length} בלוקים · ${formatDuration(booked)} מתוזמנות`}
        </p>
        {!draft && (
          <button
            onClick={() => {
              setDraft(emptyDraft(selectedDay));
              setError(null);
            }}
            className="focus-ring glass-control flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground"
          >
            <Plus size={13} aria-hidden />
            בלוק חדש
          </button>
        )}
      </div>

      {draft && (
        <div className="flex flex-col gap-3 rounded-xl border border-hairline-card bg-surface-sunken/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {draft.id ? "עריכת בלוק" : "בלוק חדש"}
            </p>
            <button
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              aria-label="סגור"
              className="focus-ring grid size-7 place-items-center rounded-lg text-muted hover:text-foreground"
            >
              <X size={14} aria-hidden />
            </button>
          </div>

          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="שם הבלוק, למשל: שיעור גמרא"
            aria-label="שם הבלוק"
            maxLength={80}
            className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="סוג הבלוק">
            {KINDS.map((kind) => (
              <button
                key={kind}
                onClick={() => setDraft({ ...draft, kind })}
                aria-pressed={draft.kind === kind}
                className={cn(
                  "focus-ring rounded-lg border px-2.5 py-1 text-xs transition-colors",
                  draft.kind === kind
                    ? "border-gold-line bg-gold-soft text-gold-ink"
                    : "border-hairline-card text-muted hover:text-foreground"
                )}
              >
                {ROUTINE_KIND_LABELS[kind]}
              </button>
            ))}
          </div>

          <div>
            <p className="mb-1.5 text-xs text-muted">באילו ימים</p>
            <div className="flex flex-wrap gap-1" role="group" aria-label="ימים">
              {WEEKDAY_INITIALS.map((initial, day) => {
                const on = draft.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        weekdays: on
                          ? draft.weekdays.filter((d) => d !== day)
                          : [...draft.weekdays, day].sort((a, b) => a - b),
                      })
                    }
                    aria-pressed={on}
                    aria-label={WEEKDAY_LABELS[day]}
                    className={cn(
                      "focus-ring grid size-8 place-items-center rounded-lg border text-xs transition-colors",
                      on
                        ? "border-gold-line bg-gold-soft font-medium text-gold-ink"
                        : "border-hairline-card text-muted hover:text-foreground"
                    )}
                  >
                    {initial}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              מ־
              <input
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                placeholder="09:00"
                inputMode="numeric"
                className="ltr focus-ring w-20 rounded-lg bg-fill-subtle px-2.5 py-1.5 text-center text-sm text-foreground"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              עד
              <input
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                placeholder="10:30"
                inputMode="numeric"
                className="ltr focus-ring w-20 rounded-lg bg-fill-subtle px-2.5 py-1.5 text-center text-sm text-foreground"
              />
            </label>
          </div>

          <input
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            placeholder="הערה (לא חובה)"
            aria-label="הערה"
            maxLength={200}
            className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />

          {error && (
            <p role="alert" className="text-xs text-red-500">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={saving}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-1.5 text-xs font-medium text-[var(--background)] disabled:opacity-50"
            >
              {saving && <Loader2 size={12} className="animate-spin" aria-hidden />}
              שמור
            </button>
            <button
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className="focus-ring rounded-lg border border-hairline-card px-3.5 py-1.5 text-xs text-muted hover:text-foreground"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {dayBlocks.length > 0 && (
        <ul className="flex flex-col gap-2">
          {dayBlocks.map((block) => (
            <li
              key={block.id}
              className={cn(
                "group flex items-start gap-3 rounded-xl border p-3",
                !block.isActive && "opacity-50"
              )}
              style={{
                borderColor: `color-mix(in srgb, var(${ROUTINE_KIND_COLOR_VAR[block.kind]}) 30%, transparent)`,
                background: `color-mix(in srgb, var(${ROUTINE_KIND_COLOR_VAR[block.kind]}) 6%, transparent)`,
              }}
            >
              <div className="ltr w-24 shrink-0 text-xs tabular-nums text-muted">
                {formatMinute(block.startMinute)}–{formatMinute(block.endMinute)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{block.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {ROUTINE_KIND_LABELS[block.kind]} ·{" "}
                  {formatDuration(block.endMinute - block.startMinute)}
                  {block.weekdays.length > 1 &&
                    ` · ${block.weekdays.map((d) => WEEKDAY_INITIALS[d]).join(", ")}`}
                </p>
                {block.note && <p className="mt-1 text-xs text-foreground/70">{block.note}</p>}

                {confirmingDelete === block.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">
                      למחוק את הבלוק{block.weekdays.length > 1 ? " מכל הימים" : ""}?
                    </span>
                    <button
                      onClick={() => {
                        deleteBlock(block.id).catch(() =>
                          setError("לא הצלחנו למחוק את הבלוק.")
                        );
                        setConfirmingDelete(null);
                      }}
                      className="focus-ring rounded-lg bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-500"
                    >
                      מחק
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(null)}
                      className="focus-ring rounded-lg px-2.5 py-1 text-xs text-muted hover:text-foreground"
                    >
                      ביטול
                    </button>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => updateBlock(block.id, { isActive: !block.isActive }).catch(() => {})}
                  aria-label={block.isActive ? "השהה בלוק" : "הפעל בלוק"}
                  title={block.isActive ? "השהה" : "הפעל"}
                  className="focus-ring rounded-md px-1.5 py-1 text-[0.65rem] text-muted transition-colors hover:text-foreground"
                >
                  {block.isActive ? "השהה" : "הפעל"}
                </button>
                <button
                  onClick={() => {
                    setDraft(draftFrom(block));
                    setError(null);
                  }}
                  aria-label={`ערוך את ${block.title}`}
                  className="focus-ring grid size-7 place-items-center rounded-md text-muted transition-colors hover:text-foreground"
                >
                  <Pencil size={13} aria-hidden />
                </button>
                <button
                  onClick={() => setConfirmingDelete(block.id)}
                  aria-label={`מחק את ${block.title}`}
                  className="focus-ring grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-red-500/12 hover:text-red-500"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {gaps.length > 0 && (
        <div className="rounded-xl border border-hairline-card bg-surface-sunken/40 p-3.5">
          <p className="mb-1.5 text-xs font-medium text-muted">חלונות פנויים ביום הזה</p>
          <ul className="flex flex-wrap gap-2">
            {gaps.map((gap) => (
              <li
                key={gap.startMinute}
                className="ltr rounded-lg bg-fill-subtle px-2.5 py-1 text-xs tabular-nums text-foreground/80"
              >
                {formatMinute(gap.startMinute)}–{formatMinute(gap.endMinute)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
