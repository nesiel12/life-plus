"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarPlus, Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { findFocusSlotsAcrossDays, type FocusSlot, type Interval } from "@/lib/calendar/findFocusSlots";
import { cn } from "@/lib/utils";
import type { ChronotypeSettings, Task } from "@/types";

interface TaskAssist {
  kind: "research" | "draft" | "unclear";
  overview?: string;
  considerations?: string[];
  draftSubject?: string;
  draftBody?: string;
  unclearReason?: string;
}

export interface TaskScheduleContext {
  busy: (Interval & { title?: string })[];
  chronotype: ChronotypeSettings;
  /** Called after a slot is really written to Google Calendar. */
  onScheduled?: () => void;
}

interface TaskAssistPanelProps {
  task: Task;
  schedule?: TaskScheduleContext;
}

const DEFAULT_HORIZON_DAYS = 7;

function formatSlot(slot: FocusSlot): string {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const day = start.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit" });
  const from = start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const to = end.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${from}–${to}`;
}

// "Beyond lists" (Sprint 5): the two ways Life Plus actually helps *do* a
// task rather than just track it. AI help (research briefing / email draft)
// is one on-demand call, fetched once and cached in local state — the same
// fetch-on-expand convention GoalJourneyCard's insight panel already
// established. Calendar placement needs no network round trip at all until
// the user commits: findFocusSlotsAcrossDays is pure and runs against
// `busy`/`chronotype` the page already fetched, exactly like CalendarAgent's
// alternative-slot search (lib/calendar/findFocusSlots.ts header) — a
// deterministic scheduler is not something to ask a model to approximate.
export function TaskAssistPanel({ task, schedule }: TaskAssistPanelProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  const [assist, setAssist] = useState<TaskAssist | null>(null);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [slots, setSlots] = useState<FocusSlot[] | null>(null);
  const [creatingSlot, setCreatingSlot] = useState<string | null>(null);
  const [createdSlot, setCreatedSlot] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !assist && !assistLoading) void loadAssist();
  }

  async function loadAssist() {
    setAssistLoading(true);
    setAssistError(null);
    try {
      const res = await fetch("/api/ai/task-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: task.title, description: task.description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAssistError(typeof data.error === "string" ? data.error : "עוזר הביצוע נכשל.");
        return;
      }
      setAssist(data.assist as TaskAssist);
    } catch {
      setAssistError("לא הצלחנו להגיע לעוזר הביצוע.");
    } finally {
      setAssistLoading(false);
    }
  }

  function copyDraft() {
    if (!assist?.draftBody) return;
    const text = assist.draftSubject ? `${assist.draftSubject}\n\n${assist.draftBody}` : assist.draftBody;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  function findSlots() {
    if (!schedule) return;
    const now = new Date();
    const until = task.dueDate ? new Date(task.dueDate) : new Date(now.getTime() + DEFAULT_HORIZON_DAYS * 86_400_000);
    setSlots(
      findFocusSlotsAcrossDays({
        from: now,
        until,
        busy: schedule.busy,
        chronotype: schedule.chronotype,
        maxResults: 3,
      })
    );
    setScheduleError(null);
    setCreatedSlot(null);
  }

  async function createEvent(slot: FocusSlot) {
    setCreatingSlot(slot.start);
    setScheduleError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: task.title, start: slot.start, end: slot.end }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScheduleError(typeof data.error === "string" ? data.error : "לא הצלחנו לקבוע את הזמן ביומן.");
        return;
      }
      setCreatedSlot(slot.start);
      schedule?.onScheduled?.();
    } catch {
      setScheduleError("לא הצלחנו להגיע ליומן.");
    } finally {
      setCreatingSlot(null);
    }
  }

  return (
    <div className="mt-1">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="focus-ring flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-medium text-gold-ink transition-colors hover:bg-fill-subtle"
      >
        <Sparkles size={12} aria-hidden />
        {open ? "סגור עזרה" : "עזור לי עם המשימה"}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-3 rounded-xl border border-hairline-card bg-surface-sunken p-3">
              {assistLoading && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  חושב על המשימה…
                </p>
              )}

              {assistError && <p className="text-xs text-accent-family">{assistError}</p>}

              {assist?.kind === "research" && (
                <div className="flex flex-col gap-1.5">
                  {assist.overview && <p className="text-xs leading-relaxed text-foreground/80">{assist.overview}</p>}
                  {!!assist.considerations?.length && (
                    <ul className="flex list-disc flex-col gap-1 pe-4 text-xs leading-relaxed text-foreground/70">
                      {assist.considerations.map((point, i) => (
                        <li key={`${point}-${i}`}>{point}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {assist?.kind === "draft" && (
                <div className="flex flex-col gap-1.5">
                  {assist.draftSubject && <p className="text-xs font-medium text-foreground">{assist.draftSubject}</p>}
                  {assist.draftBody && (
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">{assist.draftBody}</p>
                  )}
                  <button
                    onClick={copyDraft}
                    className="focus-ring mt-1 flex w-fit items-center gap-1.5 rounded-lg border border-hairline-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-fill-subtle"
                  >
                    {copied ? <Check size={12} className="text-accent-health" aria-hidden /> : <Sparkles size={12} aria-hidden />}
                    {copied ? "הועתק" : "העתק טיוטה"}
                  </button>
                </div>
              )}

              {assist?.kind === "unclear" && assist.unclearReason && (
                <p className="text-xs text-muted">{assist.unclearReason}</p>
              )}

              {schedule && (
                <div className={cn("flex flex-col gap-2", assist && "border-t border-hairline-card pt-3")}>
                  {slots === null ? (
                    <button
                      onClick={findSlots}
                      className="focus-ring flex w-fit items-center gap-1.5 rounded-lg border border-hairline-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-fill-subtle"
                    >
                      <CalendarPlus size={12} className="text-accent-time" aria-hidden />
                      הצע זמן ביומן
                    </button>
                  ) : slots.length === 0 ? (
                    <p className="text-xs text-muted">לא מצאנו חלון פנוי מתאים לפני מועד היעד.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {slots.map((slot) => (
                        <button
                          key={slot.start}
                          onClick={() => createEvent(slot)}
                          disabled={creatingSlot !== null || createdSlot === slot.start}
                          className={cn(
                            "focus-ring flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-70",
                            createdSlot === slot.start
                              ? "border-accent-health/40 bg-accent-health/10 text-accent-health"
                              : "border-hairline-card text-foreground hover:bg-fill-subtle"
                          )}
                        >
                          <span className="ltr">{formatSlot(slot)}</span>
                          {creatingSlot === slot.start ? (
                            <Loader2 size={12} className="animate-spin" aria-hidden />
                          ) : createdSlot === slot.start ? (
                            <span className="flex items-center gap-1">
                              <Check size={12} aria-hidden />
                              נקבע
                            </span>
                          ) : (
                            <ExternalLink size={12} className="text-muted" aria-hidden />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {scheduleError && <p className="text-xs text-accent-family">{scheduleError}</p>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
