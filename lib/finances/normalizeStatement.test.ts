import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvCells, detectDelimiter } from "@/lib/finances/parseCsv";
import {
  normalizeStatement,
  parseAmount,
  parseStatementDate,
} from "@/lib/finances/normalizeStatement";

describe("parseCsvCells", () => {
  it("handles quoted fields containing the delimiter", () => {
    const rows = parseCsvCells('a,b\n"hello, world",2');
    expect(rows[1]).toEqual(["hello, world", "2"]);
  });

  it("handles doubled quotes as an escaped quote", () => {
    const rows = parseCsvCells('a\n"she said ""hi"""');
    expect(rows[1][0]).toBe('she said "hi"');
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsvCells("a,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM so the first header is usable", () => {
    const rows = parseCsvCells("﻿Date,Amount\n2026-01-01,5");
    expect(rows[0][0]).toBe("Date");
  });

  it("keeps embedded newlines inside quoted fields", () => {
    const rows = parseCsvCells('a,b\n"line1\nline2",2');
    expect(rows[1][0]).toBe("line1\nline2");
  });

  it("drops entirely blank rows", () => {
    const rows = parseCsvCells("a,b\n1,2\n\n\n3,4");
    expect(rows).toHaveLength(3);
  });
});

describe("detectDelimiter", () => {
  it("detects semicolons, which European and Israeli exports commonly use", () => {
    expect(detectDelimiter("Date;Amount;Description\n01/01/2026;5;x")).toBe(";");
  });

  it("detects tabs", () => {
    expect(detectDelimiter("Date\tAmount\n1\t2")).toBe("\t");
  });

  it("defaults to comma when there is no delimiter at all", () => {
    expect(detectDelimiter("SingleColumn\nvalue")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("keys rows by header", () => {
    const rows = parseCsv("Date,Amount\n2026-01-01,10");
    expect(rows).toEqual([{ Date: "2026-01-01", Amount: "10" }]);
  });

  it("disambiguates duplicate headers instead of overwriting", () => {
    const rows = parseCsv("Amount,Amount\n1,2");
    expect(rows[0]).toEqual({ Amount: "1", Amount_2: "2" });
  });

  it("returns nothing for a header-only file", () => {
    expect(parseCsv("Date,Amount")).toEqual([]);
  });
});

describe("parseAmount", () => {
  it("parses plain numbers", () => {
    expect(parseAmount("1234.56")).toBe(1234.56);
    expect(parseAmount("42")).toBe(42);
  });

  it("handles US grouping", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
  });

  it("handles European grouping where comma is the decimal", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("12,50")).toBe(12.5);
  });

  it("treats a comma before three digits as grouping, not decimal", () => {
    expect(parseAmount("1,234")).toBe(1234);
  });

  it("strips currency symbols and codes", () => {
    expect(parseAmount("₪1,234.56")).toBe(1234.56);
    expect(parseAmount("1234.56 ILS")).toBe(1234.56);
    expect(parseAmount("$99.99")).toBe(99.99);
  });

  it("reads accounting parentheses as negative", () => {
    expect(parseAmount("(1,234.56)")).toBe(-1234.56);
  });

  it("handles explicit signs", () => {
    expect(parseAmount("-50")).toBe(-50);
    expect(parseAmount("+50")).toBe(50);
  });

  it("returns null for junk rather than guessing", () => {
    for (const bad of ["", "   ", "abc", "-", "₪"]) {
      expect(parseAmount(bad), bad).toBeNull();
    }
  });
});

describe("parseStatementDate", () => {
  it("passes through ISO dates", () => {
    expect(parseStatementDate("2026-03-14")).toBe("2026-03-14");
    expect(parseStatementDate("2026-03-14T10:00:00Z")).toBe("2026-03-14");
  });

  it("reads ambiguous dates as DD/MM, the locale this app targets", () => {
    expect(parseStatementDate("03/04/2026")).toBe("2026-04-03");
  });

  it("infers MM/DD when the first component cannot be a day", () => {
    expect(parseStatementDate("12/25/2026")).toBe("2026-12-25");
  });

  it("accepts dot and dash separators", () => {
    expect(parseStatementDate("14.03.2026")).toBe("2026-03-14");
    expect(parseStatementDate("14-03-2026")).toBe("2026-03-14");
  });

  it("expands two-digit years", () => {
    expect(parseStatementDate("14/03/26")).toBe("2026-03-14");
    expect(parseStatementDate("14/03/99")).toBe("1999-03-14");
  });

  it("rejects impossible dates instead of rolling them over", () => {
    // Date would happily turn 31 February into 3 March; a finance import must not.
    expect(parseStatementDate("31/02/2026")).toBeNull();
    expect(parseStatementDate("32/01/2026")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    for (const bad of ["", "not a date", "2026", "13/13/2026"]) {
      expect(parseStatementDate(bad), bad).toBeNull();
    }
  });
});

describe("normalizeStatement", () => {
  it("maps a signed-amount statement", () => {
    const rows = parseCsv(
      ["Date,Description,Amount", "01/03/2026,Supermarket,-250.50", "05/03/2026,Salary,10000"].join("\n")
    );
    const result = normalizeStatement(rows);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      date: "2026-03-01",
      title: "Supermarket",
      amount: 250.5,
      type: "expense",
    });
    expect(result.transactions[1]).toMatchObject({ type: "income", amount: 10000 });
  });

  it("maps separate debit and credit columns", () => {
    const rows = parseCsv(
      ["תאריך,תיאור,חובה,זכות", "01/03/2026,סופר,250.50,", "05/03/2026,משכורת,,10000"].join("\n")
    );
    const result = normalizeStatement(rows);

    expect(result.transactions[0]).toMatchObject({ type: "expense", amount: 250.5 });
    expect(result.transactions[1]).toMatchObject({ type: "income", amount: 10000 });
  });

  it("matches headers by substring, so decorated names still work", () => {
    const rows = parseCsv("Transaction Date,Payee Name,Transaction Amount (ILS)\n01/03/2026,Shop,-10");
    const result = normalizeStatement(rows);
    expect(result.transactions).toHaveLength(1);
  });

  it("reports rejected rows instead of silently dropping them", () => {
    const rows = parseCsv(
      ["Date,Description,Amount", "not-a-date,Shop,-10", "01/03/2026,Shop,notanumber", "01/03/2026,Good,-10"].join("\n")
    );
    const result = normalizeStatement(rows);

    expect(result.transactions).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].row).toBe(2);
    expect(result.rejected[1].reason).toContain("סכום");
  });

  it("falls back to a placeholder title rather than an empty one", () => {
    const rows = parseCsv("Date,Description,Amount\n01/03/2026,,-10");
    expect(normalizeStatement(rows).transactions[0].title).toBe("תנועה ללא תיאור");
  });

  it("ignores zero-amount rows as unparseable rather than importing them", () => {
    const rows = parseCsv("Date,Description,Amount\n01/03/2026,Nothing,0");
    const result = normalizeStatement(rows);
    expect(result.transactions).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it("returns empty structures for an empty file", () => {
    expect(normalizeStatement([])).toEqual({ transactions: [], rejected: [], mapping: {} });
  });

  it("carries through a source category when present", () => {
    const rows = parseCsv("Date,Description,Amount,Category\n01/03/2026,Shop,-10,Groceries");
    expect(normalizeStatement(rows).transactions[0].rawCategory).toBe("Groceries");
  });
});
