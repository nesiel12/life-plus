import { describe, expect, it } from "vitest";
import { buildFinanceReportCsv, csvField } from "@/lib/finances/exportReport";
import { buildSnapshot, type AnalyzableTransaction } from "@/lib/finances/analyze";

describe("csvField", () => {
  it("quotes every field", () => {
    expect(csvField("plain")).toBe('"plain"');
  });

  it("escapes embedded quotes by doubling", () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("neutralises CSV injection", () => {
    // A title starting with = would execute as a formula when the user opens
    // their own exported report in Excel or Sheets.
    expect(csvField("=HYPERLINK(\"http://evil\",\"click\")")).toMatch(/^"'=HYPERLINK/);
    expect(csvField("+1234")).toMatch(/^"'\+/);
    expect(csvField("-cmd")).toMatch(/^"'-/);
    expect(csvField("@SUM(A1)")).toMatch(/^"'@/);
  });

  it("leaves ordinary text and negative numbers passed as numbers alone", () => {
    expect(csvField("Supermarket")).toBe('"Supermarket"');
    // Numbers are not strings, so the guard doesn't mangle a real negative.
    expect(csvField(-50)).toBe('"\'-50"');
  });
});

describe("buildFinanceReportCsv", () => {
  const data: AnalyzableTransaction[] = [
    { date: "2026-01-05", amount: 10000, type: "income", category: "salary" },
    { date: "2026-02-05", amount: 12000, type: "income", category: "salary" },
    { date: "2026-02-06", amount: 3000, type: "expense", category: "groceries" },
  ];
  const snapshot = buildSnapshot(data, "2026-02")!;
  const txs = data.map((t) => ({ ...t, title: "row" }));

  it("starts with a UTF-8 BOM so Excel renders Hebrew correctly", () => {
    expect(buildFinanceReportCsv(snapshot, txs).charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings", () => {
    expect(buildFinanceReportCsv(snapshot, txs)).toContain("\r\n");
  });

  it("includes the summary figures", () => {
    const csv = buildFinanceReportCsv(snapshot, txs);
    expect(csv).toContain("12000");
    expect(csv).toContain("3000");
    expect(csv).toContain("סיכום");
  });

  it("renders category labels rather than raw keys", () => {
    const csv = buildFinanceReportCsv(snapshot, txs);
    expect(csv).toContain("סופר ומכולת");
    expect(csv).not.toContain('"groceries"');
  });

  it("states plainly when the savings rate is uncomputable", () => {
    const noIncome = buildSnapshot(
      [{ date: "2026-01-01", amount: 10, type: "expense", category: "other" }],
      "2026-01"
    )!;
    expect(buildFinanceReportCsv(noIncome, [])).toContain("לא ניתן לחישוב");
  });

  it("omits the comparison block when there is no previous month", () => {
    const first = buildSnapshot(data, "2026-01")!;
    expect(buildFinanceReportCsv(first, txs)).not.toContain("השוואה לחודש הקודם");
  });

  it("neutralises an injected transaction title end to end", () => {
    const csv = buildFinanceReportCsv(snapshot, [
      { date: "2026-02-06", title: "=cmd|'/c calc'!A1", amount: 10, type: "expense", category: "other" },
    ]);
    expect(csv).toContain("\"'=cmd");
  });
});
