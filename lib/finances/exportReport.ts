import type { FinancialSnapshot } from "@/lib/finances/analyze";
import { categoryLabelFor } from "@/lib/finances/categories";

// CSV report export.
//
// CSV rather than .xlsx deliberately: the only viable npm route to real xlsx
// is SheetJS, which is pinned on npm at a version with unfixed ReDoS and
// prototype-pollution advisories, and exceljs pulls a vulnerable transitive
// dependency. Excel opens CSV natively, and the brief allows "Excel/CSV". Not
// worth new attack surface for cell shading.

export interface ExportableTransaction {
  date: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
}

/**
 * Quotes a CSV field.
 *
 * The leading-character guard is a real security measure, not pedantry: a cell
 * beginning with = + - or @ is interpreted by Excel and Sheets as a formula, so
 * an imported transaction titled `=HYPERLINK(...)` becomes live code when the
 * user opens their own export. Prefixing with a single quote neutralises it.
 */
export function csvField(value: string | number): string {
  const raw = String(value ?? "");
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function row(cells: (string | number)[]): string {
  return cells.map(csvField).join(",");
}

/**
 * Builds the full report. A UTF-8 BOM is prepended because Excel on Windows
 * otherwise renders Hebrew as mojibake — without it this file is unreadable
 * for exactly the audience it is written for.
 */
export function buildFinanceReportCsv(
  snapshot: FinancialSnapshot,
  transactions: ExportableTransaction[]
): string {
  const lines: string[] = [];

  lines.push(row(["דוח פיננסי — Life Plus"]));
  lines.push(row([`חודש: ${snapshot.month}`]));
  lines.push("");

  lines.push(row(["סיכום"]));
  lines.push(row(["הכנסות", snapshot.income]));
  lines.push(row(["הוצאות", snapshot.expenses]));
  lines.push(row(["נטו", snapshot.net]));
  lines.push(
    row(["שיעור חיסכון (%)", snapshot.savingsRate === null ? "לא ניתן לחישוב" : snapshot.savingsRate])
  );
  lines.push("");

  lines.push(row(["פילוח הוצאות"]));
  lines.push(row(["קטגוריה", "סכום", "אחוז מסך ההוצאות"]));
  for (const category of snapshot.topCategories) {
    lines.push(row([category.label, category.total, `${Math.round(category.share * 100)}%`]));
  }
  lines.push("");

  lines.push(row(["עסקי מול אישי"]));
  lines.push(row(["", "הכנסות", "הוצאות"]));
  lines.push(row(["עסקי", snapshot.business.income, snapshot.business.expenses]));
  lines.push(row(["אישי", snapshot.personal.income, snapshot.personal.expenses]));
  lines.push("");

  if (snapshot.vsPreviousMonth) {
    lines.push(row(["השוואה לחודש הקודם"]));
    lines.push(row(["שינוי בהכנסות", snapshot.vsPreviousMonth.incomeDelta]));
    lines.push(row(["שינוי בהוצאות", snapshot.vsPreviousMonth.expenseDelta]));
    if (snapshot.vsPreviousMonth.expensePctChange !== null) {
      lines.push(row(["שינוי באחוזים", `${snapshot.vsPreviousMonth.expensePctChange}%`]));
    }
    lines.push("");
  }

  lines.push(row(["תנועות"]));
  lines.push(row(["תאריך", "תיאור", "קטגוריה", "סוג", "סכום"]));
  for (const tx of transactions) {
    lines.push(
      row([
        tx.date,
        tx.title,
        categoryLabelFor(tx.category),
        tx.type === "income" ? "הכנסה" : "הוצאה",
        tx.amount,
      ])
    );
  }

  return `﻿${lines.join("\r\n")}`;
}
