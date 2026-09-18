"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronLeft, Lightbulb, Loader2, MessagesSquare, ScanSearch, Scale, Swords, X } from "lucide-react";
import { HAVRUTA_MODE_LABELS } from "@/lib/torah/havruta";
import { relativeDayLabel, type ContradictionAlertView, type HavrutaThreadView } from "@/lib/torah/havrutaDto";
import { cn } from "@/lib/utils";

type ThreadItem = HavrutaThreadView & { href: string };

const KIND_LABEL = { halachic: "סתירה הלכתית", logical: "סתירה הגיונית" } as const;

/**
 * "עיון וחברותא" — contradictions found across the learner's notes, and their
 * recent Havruta discussions.
 *
 * Scanning is on demand, not on every visit: each scan is a model call, and
 * the scanner only re-judges pairs whose text changed, so a second press
 * right after the first is cheap and honest ("לא נמצאו סתירות חדשות").
 */
export function IyunHavrutaWidget() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [alerts, setAlerts] = useState<ContradictionAlertView[] | null>(null);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([
        fetch("/api/torah/contradictions", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/torah/havruta", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setAlerts(Array.isArray(a.alerts) ? a.alerts : []);
      setThreads(Array.isArray(t.threads) ? t.threads : []);
    } catch {
      setAlerts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function scan() {
    setScanning(true);
    setScanMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/torah/contradictions", { method: "POST" });
      const data = await response.json();
      if (!response.ok || data.error) {
        setError(typeof data.error === "string" ? data.error : "הסריקה נכשלה. נסה שוב.");
        return;
      }
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      if (data.notes < 2) setScanMessage("צריך לפחות שני סיכומים של ממש, על ספרים או שיעורים שונים, כדי לסרוק.");
      else if (data.scanned === 0) setScanMessage("אין סיכומים חדשים או ששונו מאז הסריקה האחרונה.");
      else if (data.found === 0) setScanMessage(`נבדקו ${data.scanned} זוגות סיכומים — לא נמצאו סתירות.`);
      else setScanMessage(`נבדקו ${data.scanned} זוגות — נמצאו ${data.found} סתירות לעיון.`);
    } catch {
      setError("הסריקה נכשלה. נסה שוב.");
    } finally {
      setScanning(false);
    }
  }

  async function decide(alert: ContradictionAlertView, status: "resolved" | "dismissed") {
    setBusyId(alert.id);
    try {
      const response = await fetch(`/api/torah/contradictions/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.ok) setAlerts((prev) => prev?.filter((a) => a.id !== alert.id) ?? prev);
    } finally {
      setBusyId(null);
    }
  }

  async function discuss(alert: ContradictionAlertView) {
    setBusyId(alert.id);
    try {
      const response = await fetch(`/api/torah/contradictions/${alert.id}`, { method: "POST" });
      const data = await response.json();
      if (data.href) router.push(data.href);
      else setError("לא הצלחנו לפתוח את הדיון.");
    } catch {
      setError("לא הצלחנו לפתוח את הדיון.");
    } finally {
      setBusyId(null);
    }
  }

  const openCount = alerts?.length ?? 0;

  return (
    <section className="glass-card flex flex-col gap-4 rounded-3xl p-5 sm:p-6" aria-labelledby="iyun-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-family/12 text-accent-family" aria-hidden>
            <Scale size={18} />
          </span>
          <div>
            <h2 id="iyun-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
              עיון וחברותא
              {openCount > 0 && (
                <span className="rounded-full bg-accent-family px-2 py-0.5 text-[0.65rem] font-semibold text-white">{openCount}</span>
              )}
            </h2>
            <p className="text-xs text-muted">סתירות בין הסיכומים שלך, ודיונים עם החברותא</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void scan()}
          disabled={scanning}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3.5 py-1.5 text-sm font-medium text-foreground/85 transition-colors hover:border-gold-line disabled:opacity-60"
        >
          {scanning ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ScanSearch size={14} aria-hidden />}
          {scanning ? "סורק את הסיכומים…" : "סרוק סתירות"}
        </button>
      </div>

      {scanMessage && (
        <p className="rounded-xl bg-fill-subtle px-3 py-2 text-xs text-foreground/80" role="status">
          {scanMessage}
        </p>
      )}
      {error && <p className="text-xs text-accent-family">{error}</p>}

      {alerts === null ? (
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          <Loader2 size={13} className="animate-spin" aria-hidden />
          טוען…
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {alerts.map((alert) => (
              <motion.li
                key={alert.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                className="rounded-2xl border border-accent-family/25 bg-surface p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent-family/12 px-2 py-0.5 text-[0.65rem] font-medium text-accent-family">
                    {alert.kind ? KIND_LABEL[alert.kind] : "סתירה"}
                  </span>
                  <span className="text-[0.65rem] text-muted">ודאות {Math.round(alert.confidence * 100)}%</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{alert.explanation}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[alert.left, alert.right].map((side) => (
                    <div key={`${side.type}:${side.id}`} className="rounded-xl bg-surface-sunken/70 p-3">
                      {side.href ? (
                        <Link href={side.href} className="focus-ring mb-1 inline-block text-xs font-medium text-gold-ink hover:underline">
                          {side.label}
                        </Link>
                      ) : (
                        <p className="mb-1 text-xs font-medium text-gold-ink">{side.label}</p>
                      )}
                      <p className="line-clamp-4 text-xs leading-relaxed text-foreground/75">{side.excerpt}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === alert.id}
                    onClick={() => void discuss(alert)}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    <Swords size={13} aria-hidden />
                    {alert.threadId ? "להמשיך את הדיון" : "ליישב עם החברותא"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === alert.id}
                    onClick={() => void decide(alert, "resolved")}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-xs text-foreground/85 hover:border-gold-line disabled:opacity-60"
                  >
                    <Check size={13} aria-hidden />
                    יישבתי
                  </button>
                  <button
                    type="button"
                    disabled={busyId === alert.id}
                    onClick={() => void decide(alert, "dismissed")}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-60"
                  >
                    <X size={13} aria-hidden />
                    אין כאן סתירה
                  </button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
          {alerts.length === 0 && (
            <li className="rounded-xl border border-dashed border-hairline-card px-4 py-4 text-center text-xs text-muted">
              אין סתירות פתוחות. סרוק את הסיכומים כדי לבדוק אם משהו שכתבת על ספר אחד סותר את מה שכתבת על אחר.
            </li>
          )}
        </ul>
      )}

      {threads.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-hairline-card pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <MessagesSquare size={13} aria-hidden />
            דיונים אחרונים
          </h3>
          <ul className="flex flex-col">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={thread.href}
                  className="focus-ring group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-fill-subtle"
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg",
                      thread.mode === "contradiction" ? "bg-accent-family/12 text-accent-family" : "bg-gold-soft text-gold-ink"
                    )}
                    aria-hidden
                  >
                    {thread.mode === "contradiction" ? <Scale size={13} /> : <Swords size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{thread.title ?? HAVRUTA_MODE_LABELS[thread.mode]}</span>
                    <span className="flex items-center gap-2 text-[0.7rem] text-muted">
                      {relativeDayLabel(thread.updatedAt)}
                      {thread.insights.length > 0 && (
                        <span className="flex items-center gap-0.5 text-gold-ink">
                          <Lightbulb size={10} aria-hidden />
                          {thread.insights.length} תובנות
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronLeft size={14} className="text-muted transition-transform group-hover:-translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
