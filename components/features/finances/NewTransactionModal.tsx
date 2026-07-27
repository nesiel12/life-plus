"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownCircle, ArrowUpCircle, Briefcase, Check, X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { useApiCall } from "@/hooks/useApiCall";
import { cn } from "@/lib/utils";
import type { TransactionType } from "@/types";

interface NewTransactionModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (transaction: {
    amount: number;
    type: TransactionType;
    title: string;
    category: string;
    date?: string;
    note?: string;
    isShift?: boolean;
    hourlyRate?: number;
    shiftStart?: string;
    shiftEnd?: string;
    employer?: string;
    isRecurring?: boolean;
  }) => Promise<void>;
}

function todayDateInputValue(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultShiftStart(): string {
  return toDateTimeLocalValue(new Date());
}

function defaultShiftEnd(): string {
  return toDateTimeLocalValue(new Date(Date.now() + 8 * 60 * 60 * 1000));
}

// hourlyRate × hours worked, rounded to agorot — never recomputed
// server-side, this saved value IS the transaction's amount, same as any
// manually-entered one.
function computeShiftAmount(hourlyRate: number, start: string, end: string): number | null {
  if (!start || !end || !hourlyRate) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!(endMs > startMs)) return null;
  const hours = (endMs - startMs) / (1000 * 60 * 60);
  return Math.round(hourlyRate * hours * 100) / 100;
}

function ToggleSwitch({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="focus-ring flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2.5 transition-colors hover:bg-white/[0.07]"
    >
      <span className="flex items-center gap-1.5 text-sm text-foreground">{children}</span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent-finance" : "bg-white/15")}>
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-all",
            checked ? "end-0.5" : "start-0.5"
          )}
        />
      </span>
    </button>
  );
}

// The Finances Space's "New Transaction" flow — same fixed-header/
// scrolling-content/fixed-footer modal shape as NewTaskModal, so the
// action button stays reachable above a mobile keyboard here too.
// Finances Pro (Work & Shifts): for income, an "משמרת עבודה" toggle
// reveals employer/hourly-rate/start/end inputs and takes over the amount
// field (auto-computed, read-only) instead of the plain manual entry.
export function NewTransactionModal({ open, onClose, onCreate }: NewTransactionModalProps) {
  const [type, setType] = useState<TransactionType>("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(todayDateInputValue());
  const [note, setNote] = useState("");

  const [isShift, setIsShift] = useState(false);
  const [employer, setEmployer] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [shiftStart, setShiftStart] = useState(defaultShiftStart());
  const [shiftEnd, setShiftEnd] = useState(defaultShiftEnd());
  const [isRecurring, setIsRecurring] = useState(false);

  // Live auto-calculation — recomputes on every relevant change while
  // shift mode is on; the amount field itself becomes read-only below.
  useEffect(() => {
    if (!isShift) return;
    const computed = computeShiftAmount(Number(hourlyRate), shiftStart, shiftEnd);
    setAmount(computed !== null ? computed.toFixed(2) : "");
    setDate(shiftStart.slice(0, 10));
  }, [isShift, hourlyRate, shiftStart, shiftEnd]);

  const { loading: creating, error: createError, run: create } = useApiCall(async () => {
    await onCreate({
      amount: Number(amount),
      type,
      title: title.trim(),
      category: category.trim(),
      date,
      note: note.trim() || undefined,
      isShift,
      hourlyRate: isShift ? Number(hourlyRate) : undefined,
      shiftStart: isShift ? new Date(shiftStart).toISOString() : undefined,
      shiftEnd: isShift ? new Date(shiftEnd).toISOString() : undefined,
      employer: isShift ? employer.trim() || undefined : undefined,
      isRecurring,
    });
    resetAndClose();
  });

  function resetAndClose() {
    setType("expense");
    setTitle("");
    setAmount("");
    setCategory("");
    setDate(todayDateInputValue());
    setNote("");
    setIsShift(false);
    setEmployer("");
    setHourlyRate("");
    setShiftStart(defaultShiftStart());
    setShiftEnd(defaultShiftEnd());
    setIsRecurring(false);
    onClose();
  }

  function handleToggleShift(next: boolean) {
    setIsShift(next);
    if (next && !category.trim()) setCategory("career");
  }

  const parsedAmount = Number(amount);
  const canSave = isShift
    ? title.trim().length > 0 &&
      category.trim().length > 0 &&
      employer.trim().length > 0 &&
      Number(hourlyRate) > 0 &&
      parsedAmount > 0
    : title.trim().length > 0 && category.trim().length > 0 && amount.trim().length > 0 && parsedAmount > 0;

  function handleCreate() {
    if (!canSave || creating) return;
    create().catch(() => {
      // error is already captured in createError for display below
    });
  }

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      closeOnBackdropClick={!creating}
      closeOnEscape={!creating}
      zIndex={Z_INDEX.modal}
      panelClassName="flex max-h-[85vh] w-full max-w-2xl flex-col p-0"
    >
      <div className="flex items-center justify-between p-6 pb-4">
        <p className="text-sm font-medium text-foreground">עסקה חדשה</p>
        <button
          onClick={resetAndClose}
          disabled={creating}
          aria-label="סגור"
          className="focus-ring rounded-lg p-1.5 text-muted transition-all hover:scale-110 hover:bg-white/5 hover:text-foreground disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        <div className="flex flex-col gap-3 pb-2">
          <div className="inline-flex w-fit rounded-lg bg-white/5 p-1" role="tablist" aria-label="סוג עסקה">
            <button
              type="button"
              role="tab"
              aria-selected={type === "expense"}
              onClick={() => setType("expense")}
              className={cn(
                "focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
                type === "expense" ? "bg-accent-family/20 text-accent-family" : "text-muted hover:text-foreground"
              )}
            >
              <ArrowDownCircle size={12} aria-hidden />
              הוצאה
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={type === "income"}
              onClick={() => setType("income")}
              className={cn(
                "focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
                type === "income" ? "bg-accent-finance/20 text-accent-finance" : "text-muted hover:text-foreground"
              )}
            >
              <ArrowUpCircle size={12} aria-hidden />
              הכנסה
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="new-tx-title" className="text-xs text-muted">
              כותרת
            </label>
            <input
              id="new-tx-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isShift ? "למשל: משמרת ערב" : "למשל: קניות בסופר, משכורת חודשית"}
              className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          {type === "income" && (
            <ToggleSwitch id="new-tx-is-shift" checked={isShift} onChange={handleToggleShift}>
              <Briefcase size={13} className="text-accent-finance" aria-hidden />
              משמרת עבודה / שכר שעתי
            </ToggleSwitch>
          )}

          {isShift ? (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="new-tx-employer" className="text-xs text-muted">
                  חברה / מעסיק
                </label>
                <input
                  id="new-tx-employer"
                  value={employer}
                  onChange={(e) => setEmployer(e.target.value)}
                  placeholder="למשל: קפה השכונה"
                  className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="new-tx-hourly-rate" className="text-xs text-muted">
                    תעריף שעתי (₪)
                  </label>
                  <input
                    id="new-tx-hourly-rate"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="0.00"
                    className="focus-ring ltr rounded-lg bg-white/5 px-3 py-2 text-start text-sm text-foreground placeholder:text-muted"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="new-tx-amount" className="text-xs text-muted">
                    סכום מחושב (₪)
                  </label>
                  <input
                    id="new-tx-amount"
                    readOnly
                    value={amount}
                    placeholder="0.00"
                    aria-label="סכום מחושב אוטומטית משעות העבודה והתעריף"
                    className="ltr rounded-lg bg-white/[0.03] px-3 py-2 text-start text-sm text-muted"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="new-tx-shift-start" className="text-xs text-muted">
                    התחלת משמרת
                  </label>
                  <input
                    id="new-tx-shift-start"
                    type="datetime-local"
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                    className="focus-ring ltr rounded-lg bg-white/5 px-3 py-2 text-start text-sm text-foreground"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="new-tx-shift-end" className="text-xs text-muted">
                    סיום משמרת
                  </label>
                  <input
                    id="new-tx-shift-end"
                    type="datetime-local"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    className="focus-ring ltr rounded-lg bg-white/5 px-3 py-2 text-start text-sm text-foreground"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor="new-tx-amount" className="text-xs text-muted">
                סכום (₪)
              </label>
              <input
                id="new-tx-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="focus-ring ltr rounded-lg bg-white/5 px-3 py-2 text-start text-sm text-foreground placeholder:text-muted"
              />
            </div>
          )}

          {type === "income" && (
            <button
              type="button"
              onClick={() => setIsRecurring((v) => !v)}
              aria-pressed={isRecurring}
              className="focus-ring flex w-fit items-center gap-2 text-xs text-muted transition-colors hover:text-foreground"
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded border transition-colors",
                  isRecurring ? "border-accent-finance bg-accent-finance/20 text-accent-finance" : "border-glass-border text-transparent"
                )}
              >
                <Check size={10} aria-hidden />
              </span>
              תשלום חודשי קבוע
            </button>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="new-tx-category" className="text-xs text-muted">
              קטגוריה
            </label>
            <input
              id="new-tx-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="למשל: מכולת, משכורת, תחבורה"
              className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          {!isShift && (
            <div className="flex flex-col gap-1">
              <label htmlFor="new-tx-date" className="text-xs text-muted">
                תאריך
              </label>
              <input
                id="new-tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="focus-ring ltr rounded-lg bg-white/5 px-3 py-2 text-start text-sm text-foreground"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="new-tx-note" className="text-xs text-muted">
              הערה (לא חובה)
            </label>
            <textarea
              id="new-tx-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="פרטים נוספים…"
              className="focus-ring resize-none rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          {createError && <p className="text-xs text-accent-family">{createError}</p>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-glass-border p-6 pt-4">
        <button
          onClick={handleCreate}
          disabled={!canSave || creating}
          className="focus-ring rounded-lg bg-accent-finance/20 px-4 py-2 text-sm font-medium text-accent-finance transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {creating ? "מוסיף…" : "הוספת עסקה"}
        </button>
      </div>
    </Modal>
  );
}
