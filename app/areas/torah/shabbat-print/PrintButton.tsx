"use client";

import { Printer } from "lucide-react";

/** "הדפס / שמור כ־PDF" — the browser's own dialog does both. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="focus-ring inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      <Printer size={15} aria-hidden />
      הדפס / שמור כ־PDF
    </button>
  );
}
