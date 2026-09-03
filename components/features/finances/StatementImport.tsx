"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, FileUp, Loader2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { parseCsv } from "@/lib/finances/parseCsv";
import { normalizeStatement, type NormalizedTransaction } from "@/lib/finances/normalizeStatement";
import { categoryLabelFor } from "@/lib/finances/categories";

interface Staged extends NormalizedTransaction {
  category: string;
}

// Bank-statement import. Parsing happens in the browser — the file never
// leaves the device until the user confirms — and only the resulting titles go
// to the AI for categorisation, never account numbers or balances.
//
// Deliberately a review step rather than a straight-through import: bank CSVs
// are inconsistent enough that a silent import is how a month ends up with
// wrong dates or a mis-signed amount that nobody notices for a year.
export function StatementImport({ onImported }: { onImported?: () => void }) {
  const addTransaction = useAtlasStore((s) => s.addTransaction);

  const [staged, setStaged] = useState<Staged[] | null>(null);
  const [rejected, setRejected] = useState<{ row: number; reason: string }[]>([]);
  const [busy, setBusy] = useState<null | "parsing" | "categorizing" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSavedCount(null);
    setBusy("parsing");

    try {
      const text = await file.text();
      const { transactions, rejected: bad } = normalizeStatement(parseCsv(text));
      setRejected(bad);

      if (transactions.length === 0) {
        setError("לא זוהו תנועות בקובץ. ודא שיש עמודות תאריך וסכום.");
        setStaged(null);
        return;
      }

      // Default everything to "other" so the list is usable even if the AI
      // categorisation fails or is unavailable.
      const withCategories: Staged[] = transactions.map((t) => ({
        ...t,
        category: t.type === "income" ? "other_income" : "other",
      }));
      setStaged(withCategories);

      setBusy("categorizing");
      const res = await fetch("/api/ai/finance-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "categorize",
          transactions: transactions.slice(0, 200).map((t) => ({
            title: t.title,
            amount: t.amount,
            type: t.type,
            hint: t.rawCategory,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.categories)) {
          setStaged((prev) =>
            prev
              ? prev.map((t, i) => ({ ...t, category: data.categories[i] ?? t.category }))
              : prev
          );
        }
      }
      // A categorisation failure is not fatal — the import still works with
      // the defaults, so no error is surfaced for it.
    } catch {
      setError("קריאת הקובץ נכשלה.");
      setStaged(null);
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!staged) return;
    setBusy("saving");
    setError(null);
    let saved = 0;
    try {
      for (const tx of staged) {
        await addTransaction({
          title: tx.title,
          amount: tx.amount,
          type: tx.type,
          category: tx.category,
          date: tx.date,
        });
        saved += 1;
      }
      setSavedCount(saved);
      setStaged(null);
      onImported?.();
    } catch {
      // Report what did land, so a partial import isn't invisible.
      setError(`הייבוא נעצר אחרי ${saved} תנועות.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted">ייבוא דף חשבון</p>
        <label className="focus-ring flex cursor-pointer items-center gap-1.5 rounded-lg border border-hairline-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-fill-subtle">
          {busy === "parsing" || busy === "categorizing" ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : (
            <FileUp size={13} aria-hidden />
          )}
          {busy === "categorizing" ? "מסווג…" : "בחר קובץ CSV"}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-xs text-accent-family">
          {error}
        </p>
      )}

      {savedCount !== null && (
        <p className="flex items-center gap-1.5 text-xs text-accent-health">
          <Check size={12} aria-hidden />
          יובאו {savedCount} תנועות.
        </p>
      )}

      {rejected.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-fill-subtle p-3 text-xs text-muted">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
          <div>
            <p className="mb-1 text-foreground">{rejected.length} שורות לא יובאו:</p>
            <ul className="flex flex-col gap-0.5">
              {rejected.slice(0, 5).map((r) => (
                <li key={r.row}>
                  שורה {r.row}: {r.reason}
                </li>
              ))}
              {rejected.length > 5 && <li>ועוד {rejected.length - 5}…</li>}
            </ul>
          </div>
        </div>
      )}

      {staged && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            {staged.length} תנועות מוכנות לייבוא. בדוק לפני אישור.
          </p>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-hairline-card">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-sunken text-muted">
                <tr>
                  <th className="p-2 text-start font-medium">תאריך</th>
                  <th className="p-2 text-start font-medium">תיאור</th>
                  <th className="p-2 text-start font-medium">קטגוריה</th>
                  <th className="p-2 text-end font-medium">סכום</th>
                </tr>
              </thead>
              <tbody>
                {staged.slice(0, 100).map((tx, i) => (
                  <tr key={`${tx.date}-${i}`} className="border-t border-hairline-card">
                    <td className="ltr p-2 text-start tabular-nums text-muted">{tx.date}</td>
                    <td className="max-w-[12rem] truncate p-2 text-foreground">{tx.title}</td>
                    <td className="p-2 text-muted">{categoryLabelFor(tx.category)}</td>
                    <td
                      className={`ltr p-2 text-end tabular-nums ${tx.type === "income" ? "text-accent-health" : "text-foreground"}`}
                    >
                      {tx.type === "income" ? "+" : "−"}
                      {tx.amount.toLocaleString("he-IL", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              onClick={confirmImport}
              disabled={busy !== null}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-[var(--background)] transition-opacity disabled:opacity-40"
            >
              {busy === "saving" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
              {busy === "saving" ? "מייבא…" : `ייבא ${staged.length} תנועות`}
            </button>
            <button
              onClick={() => {
                setStaged(null);
                setRejected([]);
              }}
              disabled={busy !== null}
              className="focus-ring rounded-lg border border-hairline-card px-3 py-2 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
