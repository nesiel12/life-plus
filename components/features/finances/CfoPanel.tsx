"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Brain, Download, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { buildSnapshot, type FinancialSnapshot } from "@/lib/finances/analyze";
import { buildFinanceReportCsv } from "@/lib/finances/exportReport";
import type { CfoAnalysis } from "@/lib/ai/agents/financeAgent";
import { cn } from "@/lib/utils";

const STANDING_STYLE: Record<CfoAnalysis["standing"], { label: string; className: string }> = {
  strong: { label: "מצב חזק", className: "text-accent-health" },
  steady: { label: "יציב", className: "text-gold-ink" },
  tight: { label: "מצומצם", className: "text-accent-fitness" },
  concerning: { label: "דורש תשומת לב", className: "text-accent-family" },
};

function formatIls(amount: number): string {
  return `${amount.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₪`;
}

// The Personal CFO surface.
//
// The snapshot is computed locally and rendered immediately — the numbers do
// not wait on, or depend on, an AI call. The agent adds interpretation on top.
// That ordering is deliberate: if the model is unavailable or slow, the user
// still sees their real financial position rather than a spinner.
export function CfoPanel() {
  const reduce = useReducedMotion();
  const transactions = useAtlasStore((s) => s.transactions);

  const [analysis, setAnalysis] = useState<CfoAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshot: FinancialSnapshot | null = useMemo(
    () =>
      buildSnapshot(
        transactions.map((t) => ({
          amount: t.amount,
          type: t.type,
          category: t.category,
          date: t.date,
        }))
      ),
    [transactions]
  );

  async function runAnalysis() {
    if (!snapshot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/finance-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "analyze",
          month: snapshot.month,
          transactions: transactions.map((t) => ({
            amount: t.amount,
            type: t.type,
            category: t.category,
            date: t.date,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "הניתוח נכשל.");
        return;
      }
      setAnalysis(data.analysis ?? null);
    } catch {
      setError("לא הצלחנו להגיע ל-CFO.");
    } finally {
      setBusy(false);
    }
  }

  function downloadReport() {
    if (!snapshot) return;
    const csv = buildFinanceReportCsv(
      snapshot,
      transactions
        .filter((t) => t.date.slice(0, 7) === snapshot.month)
        .map((t) => ({
          date: t.date,
          title: t.title,
          amount: t.amount,
          type: t.type,
          category: t.category,
        }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `life-plus-finance-${snapshot.month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!snapshot) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Brain size={15} className="text-accent-finance" aria-hidden />
          ה-CFO האישי
        </p>
        <p className="text-xs text-muted">אין עדיין תנועות לניתוח. ייבא דף חשבון או הוסף תנועה.</p>
      </div>
    );
  }

  const standing = analysis ? STANDING_STYLE[analysis.standing] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Brain size={15} className="text-accent-finance" aria-hidden />
          ה-CFO האישי
          <span className="ltr text-xs text-muted">· {snapshot.month}</span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={downloadReport}
            className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-fill-subtle"
          >
            <Download size={13} aria-hidden />
            ייצוא דוח
          </button>
          <button
            onClick={runAnalysis}
            disabled={busy}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-[var(--background)] transition-opacity disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Brain size={13} aria-hidden />}
            {busy ? "מנתח…" : "נתח את החודש"}
          </button>
        </div>
      </div>

      {/* Real numbers first, independent of the AI. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="הכנסות" value={formatIls(snapshot.income)} tone="income" />
        <Stat label="הוצאות" value={formatIls(snapshot.expenses)} tone="expense" />
        <Stat label="נטו" value={formatIls(snapshot.net)} tone={snapshot.net >= 0 ? "income" : "expense"} />
        <Stat
          label="שיעור חיסכון"
          value={snapshot.savingsRate === null ? "—" : `${snapshot.savingsRate}%`}
        />
      </div>

      {snapshot.topCategories.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted">לאן הלך הכסף</p>
          {snapshot.topCategories.map((category, i) => (
            <motion.div
              key={category.key}
              initial={reduce ? false : { opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.25) }}
              className="flex items-center gap-3"
            >
              <span className="w-28 shrink-0 truncate text-xs text-foreground/80">{category.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill-subtle">
                <span
                  className="block h-full rounded-full bg-[var(--gold)]"
                  style={{ width: `${Math.round(category.share * 100)}%` }}
                />
              </span>
              <span className="ltr w-20 shrink-0 text-end text-xs tabular-nums text-muted">
                {formatIls(category.total)}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {snapshot.vsPreviousMonth && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          {snapshot.vsPreviousMonth.expenseDelta > 0 ? (
            <TrendingUp size={12} className="text-accent-fitness" aria-hidden />
          ) : (
            <TrendingDown size={12} className="text-accent-health" aria-hidden />
          )}
          הוצאות מול החודש הקודם:{" "}
          <span className="ltr tabular-nums">
            {snapshot.vsPreviousMonth.expenseDelta >= 0 ? "+" : ""}
            {formatIls(snapshot.vsPreviousMonth.expenseDelta)}
          </span>
          {snapshot.vsPreviousMonth.expensePctChange !== null && (
            <span className="ltr tabular-nums">({snapshot.vsPreviousMonth.expensePctChange}%)</span>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-accent-family">
          {error}
        </p>
      )}

      {analysis && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 border-t border-hairline-card pt-4"
        >
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{analysis.headline}</p>
            {standing && (
              <span className={cn("shrink-0 text-xs font-medium", standing.className)}>
                {standing.label}
              </span>
            )}
          </div>

          <ul className="flex list-disc flex-col gap-1 pe-4 text-xs leading-relaxed text-foreground/80">
            {analysis.observations.map((observation, i) => (
              <li key={`${observation}-${i}`}>{observation}</li>
            ))}
          </ul>

          {analysis.recommendations.length > 0 && (
            <div className="rounded-lg bg-gold-soft p-3">
              <p className="mb-1 text-xs font-medium text-gold-ink">המלצות</p>
              <ul className="flex list-disc flex-col gap-1 pe-4 text-xs leading-relaxed text-gold-ink">
                {analysis.recommendations.map((rec, i) => (
                  <li key={`${rec}-${i}`}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "income" | "expense";
}) {
  return (
    <div className="rounded-xl border border-hairline-card bg-surface-sunken p-3">
      <p className="text-[0.65rem] text-muted">{label}</p>
      <p
        className={cn(
          "ltr mt-0.5 text-sm font-semibold tabular-nums",
          tone === "income" && "text-accent-health",
          tone === "expense" && "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
