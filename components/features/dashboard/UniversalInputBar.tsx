"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Mic, Send, Sparkles, Square, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { recordRecommendationOutcomeAction } from "@/app/actions/recommendations";
import {
  ROUTINE_KIND_LABELS,
  WEEKDAY_INITIALS,
  formatMinute,
  type RoutineKind,
} from "@/lib/schedule/routine";
import type { CheckIn, LifeAreaKey, MomentCategory } from "@/types";
import { cn } from "@/lib/utils";

interface Proposal {
  type: string;
  recommendationEventId: string;
  addMoment?: { category: MomentCategory; title: string; content: string };
  addGoal?: { title: string; category: LifeAreaKey };
  addTask?: { title: string; dueAt?: string; isHighPriority?: boolean };
  addCalendarEvent?: { title: string; start: string; end: string };
  addRoutineBlock?: {
    title: string;
    kind: RoutineKind;
    weekdays: number[];
    startMinute: number;
    endMinute: number;
  };
  logCheckIn?: { activity: CheckIn["activity"]; energy: number; note?: string };
  logFamilyInteraction?: { personId: string; personName: string; note?: string };
  clearCalendarRange?: {
    period: string;
    day: string;
    events: { googleEventId: string; calendarId?: string; title: string; start: string }[];
  };
}

const ACTIVITY_LABELS: Record<CheckIn["activity"], string> = {
  work: "עבודה",
  study: "לימודים",
  training: "אימון",
  family: "משפחה",
  friends: "חברים",
  rest: "מנוחה",
  errands: "סידורים",
  other: "אחר",
};

function formatInstant(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A one-line, human description of exactly what will happen on confirm. */
function describeProposal(proposal: Proposal): string | null {
  if (proposal.addMoment) return `רגע חדש: ${proposal.addMoment.title}`;
  if (proposal.addGoal) return `מטרה חדשה: ${proposal.addGoal.title}`;
  if (proposal.addTask) {
    const due = proposal.addTask.dueAt ? ` · ${proposal.addTask.dueAt.replace("T", " ")}` : "";
    return `משימה: ${proposal.addTask.title}${due}${proposal.addTask.isHighPriority ? " · דחוף" : ""}`;
  }
  if (proposal.addCalendarEvent) {
    return `אירוע ביומן: ${proposal.addCalendarEvent.title} · ${formatInstant(
      proposal.addCalendarEvent.start
    )}`;
  }
  if (proposal.addRoutineBlock) {
    const b = proposal.addRoutineBlock;
    return `בלוז: ${b.title} · ${ROUTINE_KIND_LABELS[b.kind]} · ${b.weekdays
      .map((d) => WEEKDAY_INITIALS[d])
      .join(", ")} ${formatMinute(b.startMinute)}–${formatMinute(b.endMinute)}`;
  }
  if (proposal.logCheckIn) {
    return `צ׳ק-אין: ${ACTIVITY_LABELS[proposal.logCheckIn.activity]} · אנרגיה ${proposal.logCheckIn.energy}`;
  }
  if (proposal.logFamilyInteraction) {
    return `תיעוד שיחה עם ${proposal.logFamilyInteraction.personName}`;
  }
  if (proposal.clearCalendarRange) {
    return `מחיקת ${proposal.clearCalendarRange.events.length} אירועים מהיומן`;
  }
  return null;
}

/**
 * One bar that does anything.
 *
 * The app has a dozen "add" surfaces — a task form, an event form, a check-in
 * card, a schedule editor — and knowing which one to open is itself work the
 * user has to do. This removes that step: say the thing, and it routes.
 *
 * Speak or type. Voice matters more than it looks: the fastest way to capture
 * something while walking is to say it, and the alternative is that it never
 * gets captured at all.
 *
 * Nothing is executed without a distinct confirm, and the confirmation shows
 * the concrete parsed result rather than the sentence — the whole risk of a
 * natural-language bar is acting on a misreading, and seeing "אירוע: פגישה ·
 * יום ג׳ 10:00" is what catches that before it happens.
 */
export function UniversalInputBar() {
  const reduce = useReducedMotion();

  const addMoment = useAtlasStore((s) => s.addMoment);
  const addGoal = useAtlasStore((s) => s.addGoal);
  const addTask = useAtlasStore((s) => s.addTask);
  const addCheckIn = useAtlasStore((s) => s.addCheckIn);
  const addRoutineBlock = useAtlasStore((s) => s.addRoutineBlock);
  const logPersonInteraction = useAtlasStore((s) => s.logPersonInteraction);

  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [executing, setExecuting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 3000);
    return () => clearTimeout(timer);
  }, [done]);

  // Release the microphone if the component unmounts mid-recording — a
  // still-live mic after navigating away is not acceptable.
  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const interpret = useCallback(async (message: string) => {
    setThinking(true);
    setError(null);
    setReply(null);
    setProposal(null);
    try {
      const res = await fetch("/api/commands/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json()) as { reply?: string; proposal?: Proposal | null; error?: string };
      if (!res.ok) {
        setError(data.error ?? "לא הצלחתי להבין את זה כרגע.");
        return;
      }
      setReply(data.reply ?? null);
      setProposal(data.proposal ?? null);
      if (data.proposal) setText("");
    } catch {
      setError("אין חיבור לשרת.");
    } finally {
      setThinking(false);
    }
  }, []);

  async function startRecording() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("הדפדפן הזה לא תומך בהקלטת קול.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick a container the browser will actually produce. Chrome/Firefox
      // give webm/opus; Safari gives mp4. Passing an unsupported type to the
      // constructor throws, so probe first and let the browser default only
      // as a last resort.
      const preferred = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported?.(t));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = recorder.mimeType || preferred || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) {
          setError("לא נקלט אודיו. נסה שוב.");
          return;
        }

        setTranscribing(true);
        try {
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const form = new FormData();
          form.set("file", new File([blob], `note.${ext}`, { type }));
          const res = await fetch("/api/ai/transcribe-audio", { method: "POST", body: form });
          const data = (await res.json().catch(() => null)) as
            | { text?: string; transcript?: string; error?: string }
            | null;
          if (!res.ok || !data) {
            setError((data?.error as string) ?? "התמלול נכשל. נסה שוב.");
            return;
          }
          const transcript = (data.text ?? data.transcript ?? "").trim();
          if (!transcript) {
            setError("לא זיהינו דיבור. נסה להקליט שוב, קרוב יותר למיקרופון.");
            return;
          }
          setText(transcript);
          await interpret(transcript);
        } catch {
          setError("לא הצלחנו להגיע לשירות התמלול.");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("אין גישה למיקרופון. אשר את ההרשאה בדפדפן ונסה שוב.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function confirm() {
    if (!proposal) return;
    setExecuting(true);
    setError(null);
    try {
      if (proposal.addMoment) {
        await addMoment(proposal.addMoment);
      } else if (proposal.addGoal) {
        await addGoal(proposal.addGoal.title, proposal.addGoal.category, []);
      } else if (proposal.addTask) {
        await addTask({
          title: proposal.addTask.title,
          dueDate: proposal.addTask.dueAt,
          isHighPriority: proposal.addTask.isHighPriority,
        });
      } else if (proposal.addCalendarEvent) {
        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proposal.addCalendarEvent),
        });
        if (!res.ok) throw new Error("calendar");
      } else if (proposal.addRoutineBlock) {
        await addRoutineBlock(proposal.addRoutineBlock);
      } else if (proposal.logCheckIn) {
        await addCheckIn(proposal.logCheckIn);
      } else if (proposal.logFamilyInteraction) {
        await logPersonInteraction(
          proposal.logFamilyInteraction.personId,
          proposal.logFamilyInteraction.note
        );
      } else if (proposal.clearCalendarRange) {
        for (const event of proposal.clearCalendarRange.events) {
          await fetch("/api/calendar/events", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              googleEventId: event.googleEventId,
              calendarId: event.calendarId ?? "primary",
            }),
          });
        }
      }

      setDone(describeProposal(proposal) ?? "בוצע");
      setProposal(null);
      setReply(null);
      // Recorded after the real action, and never surfaced as an error —
      // a tracking failure must not read as a failed action.
      recordRecommendationOutcomeAction(proposal.recommendationEventId, "accepted").catch(() => {});
    } catch {
      setError("לא הצלחנו לבצע את הפעולה. נסה שוב.");
    } finally {
      setExecuting(false);
    }
  }

  function dismiss() {
    if (proposal) {
      recordRecommendationOutcomeAction(proposal.recommendationEventId, "rejected").catch(() => {});
    }
    setProposal(null);
    setReply(null);
  }

  const busy = thinking || transcribing || executing;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Sparkles
            size={14}
            className="pointer-events-none absolute inset-y-0 start-3 my-auto text-gold-ink"
            aria-hidden
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim() && !busy) interpret(text.trim());
            }}
            disabled={recording}
            placeholder="תגיד מה שצריך — משימה, אירוע, צ׳ק-אין…"
            aria-label="שורת פקודה"
            maxLength={500}
            className="focus-ring w-full rounded-xl border border-hairline-card bg-surface py-2.5 ps-9 pe-3 text-sm text-foreground placeholder:text-muted disabled:opacity-60"
          />
        </div>

        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={thinking || transcribing || executing}
          aria-label={recording ? "עצור הקלטה" : "הקלט הודעה"}
          title={recording ? "עצור" : "דבר"}
          className={cn(
            "focus-ring grid size-10 shrink-0 place-items-center rounded-xl transition-colors disabled:opacity-50",
            recording
              ? "bg-red-500/15 text-red-500"
              : "glass-control text-foreground hover:text-gold-ink"
          )}
        >
          {transcribing ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : recording ? (
            <Square size={15} aria-hidden />
          ) : (
            <Mic size={16} aria-hidden />
          )}
        </button>

        <button
          onClick={() => text.trim() && interpret(text.trim())}
          disabled={!text.trim() || busy}
          aria-label="שלח"
          className="focus-ring glass-control grid size-10 shrink-0 place-items-center rounded-xl text-foreground disabled:opacity-40"
        >
          {thinking ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Send size={15} aria-hidden />
          )}
        </button>
      </div>

      {recording && (
        <p className="flex items-center gap-2 text-xs text-red-500">
          <motion.span
            animate={reduce ? {} : { opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className="size-2 rounded-full bg-red-500"
            aria-hidden
          />
          מקליט… לחץ לעצירה
        </p>
      )}

      <AnimatePresence mode="wait">
        {done && (
          <motion.p
            key="done"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-xs text-accent-health"
          >
            <Check size={12} aria-hidden />
            {done}
          </motion.p>
        )}

        {error && (
          <motion.p
            key="error"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="text-xs text-red-500"
          >
            {error}
          </motion.p>
        )}

        {reply && !proposal && (
          <motion.p
            key="reply"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-muted"
          >
            {reply}
          </motion.p>
        )}

        {proposal && (
          <motion.div
            key="proposal"
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-2.5 rounded-xl border border-gold-line bg-gold-soft/35 p-3"
          >
            {reply && <p className="text-sm text-foreground">{reply}</p>}
            {/* The parsed result, not the sentence. This is what catches a
                misreading before it becomes a wrong calendar entry. */}
            {describeProposal(proposal) && (
              <p className="rounded-lg bg-surface/80 px-2.5 py-1.5 text-xs text-foreground/85">
                {describeProposal(proposal)}
              </p>
            )}
            {proposal.clearCalendarRange && proposal.clearCalendarRange.events.length > 0 && (
              <ul className="flex flex-col gap-1">
                {proposal.clearCalendarRange.events.map((event) => (
                  <li key={event.googleEventId} className="text-xs text-muted">
                    · {event.title}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                onClick={confirm}
                disabled={executing}
                className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-[var(--background)] disabled:opacity-50"
              >
                {executing ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                ) : (
                  <Check size={12} aria-hidden />
                )}
                אשר
              </button>
              <button
                onClick={dismiss}
                disabled={executing}
                className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
              >
                <X size={12} aria-hidden />
                בטל
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
