import { describe, expect, it } from "vitest";
import { buildSnapshot, summarizeByMonth, type AnalyzableTransaction } from "@/lib/finances/analyze";

const tx = (
  date: string,
  amount: number,
  type: "income" | "expense",
  category = "other"
): AnalyzableTransaction => ({ date, amount, type, category });

describe("summarizeByMonth", () => {
  it("groups and sorts chronologically", () => {
    const months = summarizeByMonth([
      tx("2026-03-05", 100, "expense"),
      tx("2026-01-05", 50, "expense"),
      tx("2026-01-10", 1000, "income"),
    ]);
    expect(months.map((m) => m.month)).toEqual(["2026-01", "2026-03"]);
    expect(months[0]).toMatchObject({ income: 1000, expenses: 50, net: 950 });
  });

  it("returns nothing for no transactions", () => {
    expect(summarizeByMonth([])).toEqual([]);
  });
});

describe("buildSnapshot", () => {
  const data = [
    // January
    tx("2026-01-05", 10000, "income", "salary"),
    tx("2026-01-06", 2000, "expense", "groceries"),
    tx("2026-01-07", 1000, "expense", "transport"),
    // February
    tx("2026-02-05", 12000, "income", "salary"),
    tx("2026-02-06", 3000, "expense", "groceries"),
    tx("2026-02-07", 500, "expense", "business"),
    tx("2026-02-08", 2000, "income", "business_income"),
  ];

  it("defaults to the latest month with data, not the calendar month", () => {
    expect(buildSnapshot(data)!.month).toBe("2026-02");
  });

  it("computes totals and savings rate", () => {
    const snap = buildSnapshot(data, "2026-01")!;
    expect(snap.income).toBe(10000);
    expect(snap.expenses).toBe(3000);
    expect(snap.net).toBe(7000);
    expect(snap.savingsRate).toBe(70);
  });

  it("returns a null savings rate rather than dividing by zero", () => {
    const snap = buildSnapshot([tx("2026-01-01", 100, "expense")], "2026-01")!;
    expect(snap.savingsRate).toBeNull();
  });

  it("ranks categories by size with shares summing to one", () => {
    const snap = buildSnapshot(data, "2026-01")!;
    expect(snap.topCategories[0].key).toBe("groceries");
    const total = snap.topCategories.reduce((s, c) => s + c.share, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("gives every category zero share when there are no expenses", () => {
    const snap = buildSnapshot([tx("2026-01-01", 500, "income", "salary")], "2026-01")!;
    expect(snap.expenses).toBe(0);
    expect(snap.topCategories).toEqual([]);
  });

  it("splits business from personal", () => {
    const snap = buildSnapshot(data, "2026-02")!;
    expect(snap.business).toEqual({ income: 2000, expenses: 500 });
    expect(snap.personal).toEqual({ income: 12000, expenses: 3000 });
  });

  it("compares against the previous month", () => {
    const snap = buildSnapshot(data, "2026-02")!;
    expect(snap.vsPreviousMonth).toEqual({
      incomeDelta: 4000,
      expenseDelta: 500,
      expensePctChange: expect.closeTo(16.67, 1),
    });
  });

  it("has no comparison for the earliest month", () => {
    expect(buildSnapshot(data, "2026-01")!.vsPreviousMonth).toBeNull();
    expect(buildSnapshot(data, "2026-01")!.trailingAverageExpenses).toBeNull();
  });

  it("averages only prior months for the trailing figure", () => {
    const snap = buildSnapshot(data, "2026-02")!;
    expect(snap.trailingAverageExpenses).toBe(3000); // January only
  });

  it("handles a previous month with zero expenses without dividing by zero", () => {
    const snap = buildSnapshot(
      [tx("2026-01-01", 100, "income", "salary"), tx("2026-02-01", 50, "expense", "groceries")],
      "2026-02"
    )!;
    expect(snap.vsPreviousMonth!.expensePctChange).toBeNull();
  });

  it("returns null when there is nothing to analyse", () => {
    expect(buildSnapshot([])).toBeNull();
    expect(buildSnapshot([tx("2026-01-01", 10, "expense")], "2099-01")).toBeNull();
  });
});
