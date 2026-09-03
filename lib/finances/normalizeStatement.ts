import type { CsvRow } from "@/lib/finances/parseCsv";

// Maps an arbitrary bank CSV onto Atlas's Transaction shape.
//
// Bank exports agree on nothing: column names differ per bank and per locale,
// dates come as DD/MM/YYYY here and MM/DD/YYYY there, amounts carry currency
// symbols and locale-specific separators, and income/expense is expressed
// either as a sign or as two separate debit/credit columns. This module turns
// that variety into one shape, and reports what it could not understand rather
// than silently dropping rows — a finance import that quietly loses
// transactions is worse than one that refuses to run.

export interface NormalizedTransaction {
  date: string; // YYYY-MM-DD
  title: string;
  amount: number; // always positive; direction lives in `type`
  type: "income" | "expense";
  rawCategory?: string;
}

export interface NormalizeResult {
  transactions: NormalizedTransaction[];
  /** 1-based row numbers that could not be parsed, with the reason. */
  rejected: { row: number; reason: string }[];
  /** Which source column was used for each field, for showing the user. */
  mapping: { date?: string; title?: string; amount?: string; debit?: string; credit?: string };
}

const DATE_HEADERS = ["date", "תאריך", "transaction date", "value date", "תאריך ערך", "booking date"];
const TITLE_HEADERS = ["description", "תיאור", "details", "פרטים", "name", "payee", "narrative", "שם בית עסק", "בית עסק"];
const AMOUNT_HEADERS = ["amount", "סכום", "sum", "value"];
const DEBIT_HEADERS = ["debit", "חובה", "withdrawal", "משיכה", "expense", "הוצאה"];
const CREDIT_HEADERS = ["credit", "זכות", "deposit", "הפקדה", "income", "הכנסה"];
const CATEGORY_HEADERS = ["category", "קטגוריה", "type", "סוג"];

function findHeader(headers: string[], candidates: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = lower.indexOf(candidate);
    if (idx !== -1) return headers[idx];
  }
  // Substring fallback, so "Transaction Amount (ILS)" still matches "amount".
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

/**
 * Parses a locale-variable amount.
 *
 * The hard case is which separator is decimal: "1,234.56" and "1.234,56" are
 * the same number written two ways. Resolved by whichever separator appears
 * last, which is the decimal one in both conventions.
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  // Accounting negatives: (1,234.56)
  let negative = /^\(.*\)$/.test(value);
  if (negative) value = value.slice(1, -1);

  // Strip currency symbols/codes and spaces, keep digits, separators and sign.
  value = value.replace(/[^\d,.\-+]/g, "");
  if (value.startsWith("-")) {
    negative = true;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  if (!value) return null;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the later one is the decimal separator.
    if (lastComma > lastDot) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Comma only. Exactly two trailing digits reads as decimal ("12,50");
    // anything else is a thousands separator ("1,234").
    value = /,\d{2}$/.test(value) ? value.replace(",", ".") : value.replace(/,/g, "");
  } else {
    value = value.replace(/(?<=\d)\.(?=\d{3}\b)/g, "");
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/**
 * Parses a date to YYYY-MM-DD.
 *
 * Ambiguous DD/MM vs MM/DD is resolved toward DD/MM, matching the Israeli and
 * European convention this app targets — and, critically, an unresolvable
 * value returns null rather than a plausible wrong date. Silently filing a
 * transaction in the wrong month is worse than rejecting the row.
 */
export function parseStatementDate(raw: string): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  // Already ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parts = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(value);
  if (parts) {
    const [, first, second, year] = parts;
    let day = Number(first);
    let month = Number(second);

    // If the first component can't be a day, it must be a month (MM/DD).
    if (day > 12 && month <= 12) {
      // day stays day
    } else if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    if (day > 31 || month > 12 || day < 1 || month < 1) return null;

    let y = Number(year);
    if (year.length === 2) y += y < 70 ? 2000 : 1900;

    const dd = String(day).padStart(2, "0");
    const mm = String(month).padStart(2, "0");

    // Reject impossible dates (31 February) rather than letting Date roll over.
    const check = new Date(Date.UTC(y, month - 1, day));
    if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

    return `${y}-${mm}-${dd}`;
  }

  return null;
}

export function normalizeStatement(rows: CsvRow[]): NormalizeResult {
  if (rows.length === 0) {
    return { transactions: [], rejected: [], mapping: {} };
  }

  const headers = Object.keys(rows[0]);
  const mapping = {
    date: findHeader(headers, DATE_HEADERS),
    title: findHeader(headers, TITLE_HEADERS),
    amount: findHeader(headers, AMOUNT_HEADERS),
    debit: findHeader(headers, DEBIT_HEADERS),
    credit: findHeader(headers, CREDIT_HEADERS),
  };
  const categoryHeader = findHeader(headers, CATEGORY_HEADERS);

  const transactions: NormalizedTransaction[] = [];
  const rejected: { row: number; reason: string }[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for zero-index, +1 for the header line

    const date = mapping.date ? parseStatementDate(row[mapping.date]) : null;
    if (!date) {
      rejected.push({ row: rowNumber, reason: "תאריך לא תקין או חסר" });
      return;
    }

    let amount: number | null = null;
    let type: "income" | "expense" = "expense";

    if (mapping.debit || mapping.credit) {
      // Separate debit/credit columns: whichever is populated wins.
      const debit = mapping.debit ? parseAmount(row[mapping.debit]) : null;
      const credit = mapping.credit ? parseAmount(row[mapping.credit]) : null;
      if (debit !== null && debit !== 0) {
        amount = Math.abs(debit);
        type = "expense";
      } else if (credit !== null && credit !== 0) {
        amount = Math.abs(credit);
        type = "income";
      }
    }

    if (amount === null && mapping.amount) {
      const signed = parseAmount(row[mapping.amount]);
      if (signed !== null && signed !== 0) {
        amount = Math.abs(signed);
        type = signed < 0 ? "expense" : "income";
      }
    }

    if (amount === null) {
      rejected.push({ row: rowNumber, reason: "סכום לא תקין או חסר" });
      return;
    }

    const title = (mapping.title ? row[mapping.title] : "").trim() || "תנועה ללא תיאור";

    transactions.push({
      date,
      title,
      amount,
      type,
      rawCategory: categoryHeader ? row[categoryHeader]?.trim() || undefined : undefined,
    });
  });

  return { transactions, rejected, mapping };
}
