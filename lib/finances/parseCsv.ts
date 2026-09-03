// Dependency-free CSV parsing for bank-statement imports.
//
// Written by hand rather than pulled from npm on purpose: the obvious library
// (SheetJS `xlsx`) is stuck on npm at a version with unfixed ReDoS and
// prototype-pollution advisories, both triggered by parsing untrusted files —
// which is precisely this code path. See the commit that introduced this file.
//
// Handles the parts of RFC 4180 that real bank exports actually use: quoted
// fields, embedded commas, doubled quotes as an escape, CRLF, and a UTF-8 BOM
// (which Israeli banks emit and which silently corrupts the first header name
// if left in place).

export type CsvRow = Record<string, string>;

/** Splits CSV text into rows of raw cells. Quote-aware, so commas inside quoted fields survive. */
export function parseCsvCells(text: string, delimiter = ","): string[][] {
  // Strip BOM. Without this the first header becomes "﻿Date" and every
  // column lookup against it fails for no visible reason.
  const input = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'; // escaped quote
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (char === "\r") {
      // CRLF: the \n branch handles the row break.
    } else {
      field += char;
    }
  }

  // Trailing field/row, present unless the file ends with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Guesses the delimiter. Israeli and European bank exports are frequently
 * semicolon-separated (because the comma is a decimal separator in those
 * locales), so assuming "," would mangle a large share of real files into a
 * single column.
 */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4000).replace(/^﻿/, "");
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  const counts: Record<string, number> = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ",";
}

/** Parses to objects keyed by header. Duplicate/blank headers get positional names. */
export function parseCsv(text: string): CsvRow[] {
  const delimiter = detectDelimiter(text);
  const cells = parseCsvCells(text, delimiter);
  if (cells.length < 2) return [];

  const seen = new Map<string, number>();
  const headers = cells[0].map((raw, index) => {
    const name = raw.trim() || `column_${index + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });

  return cells.slice(1).map((row) => {
    const record: CsvRow = {};
    headers.forEach((header, i) => {
      record[header] = (row[i] ?? "").trim();
    });
    return record;
  });
}
