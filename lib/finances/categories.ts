// The category vocabulary the FinanceAgent classifies into.
//
// A closed set, not free text: the AI picking its own labels would produce
// "Groceries", "groceries", "סופר" and "מכולת" as four distinct categories, and
// every downstream total would fragment. The model chooses a key from this
// list; the label is ours.
//
// No lucide-react import here — this module is read by server-side analysis
// code, and pulling the React runtime into a server job is what previously
// broke `npm run cron` (see lib/lifeAreas.ts).

export const EXPENSE_CATEGORIES = [
  { key: "groceries", label: "סופר ומכולת" },
  { key: "dining", label: "מסעדות ובתי קפה" },
  { key: "housing", label: "דיור ושכר דירה" },
  { key: "utilities", label: "חשבונות ותשתיות" },
  { key: "transport", label: "תחבורה ודלק" },
  { key: "health", label: "בריאות" },
  { key: "education", label: "לימודים והשכלה" },
  { key: "torah", label: "תורה וצדקה" },
  { key: "family", label: "משפחה וילדים" },
  { key: "shopping", label: "קניות וביגוד" },
  { key: "entertainment", label: "פנאי ובידור" },
  { key: "business", label: "הוצאות עסקיות" },
  { key: "insurance", label: "ביטוח" },
  { key: "savings", label: "חיסכון והשקעות" },
  { key: "other", label: "אחר" },
] as const;

export const INCOME_CATEGORIES = [
  { key: "salary", label: "משכורת" },
  { key: "business_income", label: "הכנסה עסקית" },
  { key: "gift", label: "מתנה" },
  { key: "refund", label: "החזר" },
  { key: "other_income", label: "הכנסה אחרת" },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]["key"];
export type IncomeCategoryKey = (typeof INCOME_CATEGORIES)[number]["key"];
export type CategoryKey = ExpenseCategoryKey | IncomeCategoryKey;

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
const LABEL_BY_KEY = new Map<string, string>(ALL.map((c) => [c.key, c.label]));

export function categoryLabelFor(key: string): string {
  return LABEL_BY_KEY.get(key) ?? key;
}

export function isCategoryKey(value: unknown): value is CategoryKey {
  return typeof value === "string" && LABEL_BY_KEY.has(value);
}

export const EXPENSE_KEYS = EXPENSE_CATEGORIES.map((c) => c.key) as readonly string[];
export const INCOME_KEYS = INCOME_CATEGORIES.map((c) => c.key) as readonly string[];

/** Business vs personal, for the split the CFO analysis reports on. */
export function isBusinessCategory(key: string): boolean {
  return key === "business" || key === "business_income";
}
