"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, MailCheck, RefreshCw, Send } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  getEmailDeliveryStatusAction,
  sendTestEmailAction,
  type DeliveryEntry,
  type TestEmailResult,
} from "@/app/actions/emailDiagnostics";
import { NOTIFICATION_KIND_LABELS } from "@/lib/proactive/types";
import { cn } from "@/lib/utils";

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "הרגע";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function EmailStatusChip({ entry }: { entry: DeliveryEntry }) {
  if (!entry.channels.includes("email")) {
    return <span className="text-[0.7rem] text-muted">אפליקציה בלבד</span>;
  }
  if (entry.email?.status === "sent" || (entry.sentAt && !entry.email?.error)) {
    return (
      <span className="flex items-center gap-1 text-[0.7rem] text-accent-health">
        <Check size={11} aria-hidden />
        נשלח {entry.email?.at ? relative(entry.email.at) : entry.sentAt ? relative(entry.sentAt) : ""}
      </span>
    );
  }
  if (entry.email?.status === "failed") {
    return (
      <span className="flex items-center gap-1 text-[0.7rem] text-red-500" title={entry.email.error}>
        <AlertTriangle size={11} aria-hidden />
        נכשל ({entry.email.attempts ?? 1} ניסיונות)
      </span>
    );
  }
  if (entry.email?.status === "pending" || entry.status === "pending") {
    return <span className="text-[0.7rem] text-muted">ממתין לשליחה…</span>;
  }
  return <span className="text-[0.7rem] text-muted">{entry.status}</span>;
}

/**
 * "Is email actually working?" — answered on the page instead of by reading
 * cron logs. The test button forces one real send to the user's own address
 * through the exact same code path a proactive job uses; the list below shows
 * what happened to the last few real notifications.
 */
export function EmailDiagnostics() {
  const [entries, setEntries] = useState<DeliveryEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestEmailResult | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getEmailDeliveryStatusAction()
      .then((data) => {
        if (!cancelled) {
          setEntries(data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function runTest() {
    setTesting(true);
    setTestResult(null);
    sendTestEmailAction()
      .then((result) => {
        setTestResult(result);
        setReloadToken((t) => t + 1);
      })
      .catch(() => setTestResult({ status: "failed", toEmail: "", error: "השליחה נכשלה." }))
      .finally(() => setTesting(false));
  }

  return (
    <GlassCard>
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
        <MailCheck size={16} className="text-accent-career" aria-hidden />
        בדיקת מסירת מייל
      </p>
      <p className="mb-4 text-xs text-muted">
        שולח מייל בדיקה לכתובת שלך דרך אותו נתיב שבו נשלחות ההתראות, ומראה מה קרה להודעות האחרונות.
      </p>

      <button
        onClick={runTest}
        disabled={testing}
        className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-career/20 px-4 py-2 text-sm font-medium text-accent-career transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {testing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
        {testing ? "שולח…" : "שלח מייל בדיקה"}
      </button>

      {testResult && (
        <div
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-xs",
            testResult.status === "sent" && "border-accent-health/40 bg-accent-health/10 text-accent-health",
            testResult.status === "not_configured" && "border-hairline-card bg-fill-subtle text-foreground/80",
            testResult.status === "failed" && "border-red-500/40 bg-red-500/10 text-red-500"
          )}
        >
          {testResult.status === "sent" && (
            <>נשלח אל {testResult.toEmail}. אם לא הגיע תוך דקה — בדוק בספאם.</>
          )}
          {testResult.status === "not_configured" && (
            <>
              שליחת מייל לא מוגדרת בשרת (חסרים <code className="ltr">RESEND_API_KEY</code> /{" "}
              <code className="ltr">EMAIL_FROM</code>). ראה <span className="ltr">docs/EMAIL_DELIVERABILITY.md</span>.
            </>
          )}
          {testResult.status === "failed" && <>נכשל: {testResult.error}</>}
        </div>
      )}

      <div className="mt-5 border-t border-hairline-card pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-muted">הודעות אחרונות</p>
          <button
            onClick={() => setReloadToken((t) => t + 1)}
            className="focus-ring flex items-center gap-1 rounded p-1 text-muted transition-colors hover:text-foreground"
            aria-label="רענן"
          >
            <RefreshCw size={12} aria-hidden />
          </button>
        </div>

        {loadFailed ? (
          <p className="text-xs text-muted">לא הצלחנו לטעון את היסטוריית המסירה.</p>
        ) : entries === null ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            טוען…
          </p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted">עוד לא נוצרו התראות. נסה “שלח מייל בדיקה”.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline-card">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground/90">{entry.title}</p>
                  <p className="text-[0.7rem] text-muted">
                    {NOTIFICATION_KIND_LABELS[entry.kind as keyof typeof NOTIFICATION_KIND_LABELS] ??
                      entry.kind}{" "}
                    · {relative(entry.createdAt)}
                  </p>
                </div>
                <EmailStatusChip entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}
