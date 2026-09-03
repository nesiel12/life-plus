import { categoryLabelFor, isBusinessCategory } from "@/lib/finances/categories";

// Deterministic financial arithmetic, computed here and handed to the AI as
// facts rather than asked of it.
//
// The split matters: an LLM asked "what is my savings rate" will produce a
// confident number that is subtly wrong, and in a finance feature a plausible
// wrong number is worse than no number. So all totals, deltas and rates are
// computed in this module, and the model's job is limited to interpreting them
// in Hebrew — the part it is actually good at.

export interface AnalyzableTransaction {
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string; // YYYY-MM-DD
}

export interface CategoryTotal {
  key: string;
  label: string;
  total: number;
  share: number; // 0-1 of total expenses
}

export interface MonthTotals {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  net: number;
}

export interface FinancialSnapshot {
  month: string;
  income: number;
  expenses: number;
  net: number;
  /** Share of income kept. Null when there was no income (division undefined). */
  savingsRate: number | null;
  topCategories: CategoryTotal[];
  business: { income: number; expenses: number };
  personal: { income: number; expenses: number };
  /** Same month vs the previous one. Null when there is no prior month. */
  vsPreviousMonth: { incomeDelta: number; expenseDelta: number; expensePctChange: number | null } | null;
  /** Mean monthly expenses over prior months, for "is this month unusual". */
  trailingAverageExpenses: number | null;
  monthsCovered: number;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function summarizeByMonth(transactions: AnalyzableTransaction[]): MonthTotals[] {
  const byMonth = new Map<string, MonthTotals>();

  for (const tx of transactions) {
    const key = monthKey(tx.date);
    if (!key) continue;
    const entry = byMonth.get(key) ?? { month: key, income: 0, expenses: 0, net: 0 };
    if (tx.type === "income") entry.income += tx.amount;
    else entry.expenses += tx.amount;
    entry.net = entry.income - entry.expenses;
    byMonth.set(key, entry);
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds the snapshot for one month. `month` defaults to the latest month that
 * actually has data, rather than the current calendar month — an import of last
 * quarter's statements should analyse what was imported, not report an empty
 * current month.
 */
export function buildSnapshot(
  transactions: AnalyzableTransaction[],
  month?: string
): FinancialSnapshot | null {
  const months = summarizeByMonth(transactions);
  if (months.length === 0) return null;

  const target = month ?? months[months.length - 1].month;
  const current = months.find((m) => m.month === target);
  if (!current) return null;

  const inMonth = transactions.filter((tx) => monthKey(tx.date) === target);

  const expenseTotal = current.expenses;
  const byCategory = new Map<string, number>();
  for (const tx of inMonth) {
    if (tx.type !== "expense") continue;
    byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0) + tx.amount);
  }

  const topCategories: CategoryTotal[] = [...byCategory.entries()]
    .map(([key, total]) => ({
      key,
      label: categoryLabelFor(key),
      total: round(total),
      // Guard the divide: a month with only income has zero expenses.
      share: expenseTotal > 0 ? total / expenseTotal : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const business = { income: 0, expenses: 0 };
  const personal = { income: 0, expenses: 0 };
  for (const tx of inMonth) {
    const bucket = isBusinessCategory(tx.category) ? business : personal;
    if (tx.type === "income") bucket.income += tx.amount;
    else bucket.expenses += tx.amount;
  }

  const currentIndex = months.findIndex((m) => m.month === target);
  const previous = currentIndex > 0 ? months[currentIndex - 1] : null;

  const vsPreviousMonth = previous
    ? {
        incomeDelta: round(current.income - previous.income),
        expenseDelta: round(current.expenses - previous.expenses),
        expensePctChange:
          previous.expenses > 0
            ? round(((current.expenses - previous.expenses) / previous.expenses) * 100)
            : null,
      }
    : null;

  const priorMonths = months.slice(0, currentIndex);
  const trailingAverageExpenses =
    priorMonths.length > 0
      ? round(priorMonths.reduce((sum, m) => sum + m.expenses, 0) / priorMonths.length)
      : null;

  return {
    month: target,
    income: round(current.income),
    expenses: round(current.expenses),
    net: round(current.net),
    savingsRate: current.income > 0 ? round((current.net / current.income) * 100) : null,
    topCategories,
    business: { income: round(business.income), expenses: round(business.expenses) },
    personal: { income: round(personal.income), expenses: round(personal.expenses) },
    vsPreviousMonth,
    trailingAverageExpenses,
    monthsCovered: months.length,
  };
}

/**
 * The snapshot as fact-lines for an AI prompt — extracted from
 * app/api/ai/finance-agent's inline prompt build (Sprint 4) so a second
 * consumer (the Section AI Router, Sprint 6: a finance question asked
 * through the main chat) states the exact same numbers instead of
 * re-deriving a formatter that could quietly drift from the CFO panel's own.
 * One snapshot, one Hebrew rendering of it, everywhere it's shown to a model.
 */
export function formatSnapshotForPrompt(snapshot: FinancialSnapshot): string[] {
  return [
    `חודש: ${snapshot.month}`,
    `הכנסות: ${snapshot.income} ₪`,
    `הוצאות: ${snapshot.expenses} ₪`,
    `נטו: ${snapshot.net} ₪`,
    snapshot.savingsRate !== null ? `שיעור חיסכון: ${snapshot.savingsRate}%` : "שיעור חיסכון: לא ניתן לחישוב (אין הכנסה)",
    "",
    "קטגוריות ההוצאה הגדולות:",
    ...snapshot.topCategories.map((c) => `- ${c.label}: ${c.total} ₪ (${Math.round(c.share * 100)}%)`),
    "",
    `עסקי: הכנסות ${snapshot.business.income} ₪, הוצאות ${snapshot.business.expenses} ₪`,
    `אישי: הכנסות ${snapshot.personal.income} ₪, הוצאות ${snapshot.personal.expenses} ₪`,
    "",
    snapshot.vsPreviousMonth
      ? `מול החודש הקודם: הכנסות ${snapshot.vsPreviousMonth.incomeDelta >= 0 ? "+" : ""}${snapshot.vsPreviousMonth.incomeDelta} ₪, הוצאות ${snapshot.vsPreviousMonth.expenseDelta >= 0 ? "+" : ""}${snapshot.vsPreviousMonth.expenseDelta} ₪${snapshot.vsPreviousMonth.expensePctChange !== null ? ` (${snapshot.vsPreviousMonth.expensePctChange}%)` : ""}`
      : "אין חודש קודם להשוואה.",
    snapshot.trailingAverageExpenses !== null
      ? `ממוצע הוצאות בחודשים הקודמים: ${snapshot.trailingAverageExpenses} ₪`
      : "אין מספיק היסטוריה לממוצע.",
    `סה"כ חודשים בנתונים: ${snapshot.monthsCovered}`,
  ];
}

export type FinanceAlertKind = "overspent" | "unusual-expenses";

export interface FinanceAlert {
  kind: FinanceAlertKind;
  message: string;
}

// Threshold picked to mean "genuinely unusual," not "any month-to-month
// noise" — a 30% jump over the trailing average is well past ordinary
// variance (one big irregular purchase, a slow month elsewhere), so it
// reads as a real signal rather than a monthly nag.
const UNUSUAL_EXPENSE_MULTIPLIER = 1.3;

/**
 * The dashboard's "Financial Alert" (Sprint 6, the Unified Dashboard) —
 * deterministic, same division of labour as everywhere else in this module:
 * no LLM call, no interpretation, just two real, explainable conditions
 * against the snapshot's own numbers. Returns null far more often than not
 * by design — "nothing alarming this month" is the common case, and the
 * quiet-empty-state convention every other dashboard surface already holds
 * to (AIBriefing, EnergyLevelBadge) means silence here, not a manufactured
 * "you're doing great!" filler card.
 */
export function deriveFinanceAlert(snapshot: FinancialSnapshot | null): FinanceAlert | null {
  if (!snapshot) return null;

  if (snapshot.net < 0) {
    return {
      kind: "overspent",
      message: `החודש (${snapshot.month}) ההוצאות עברו את ההכנסות ב-${Math.abs(snapshot.net)} ₪.`,
    };
  }

  if (
    snapshot.trailingAverageExpenses !== null &&
    snapshot.trailingAverageExpenses > 0 &&
    snapshot.expenses > snapshot.trailingAverageExpenses * UNUSUAL_EXPENSE_MULTIPLIER
  ) {
    const pctOver = Math.round((snapshot.expenses / snapshot.trailingAverageExpenses - 1) * 100);
    return {
      kind: "unusual-expenses",
      message: `ההוצאות החודש (${snapshot.expenses} ₪) גבוהות ב-${pctOver}% מהממוצע הרגיל שלך.`,
    };
  }

  return null;
}
