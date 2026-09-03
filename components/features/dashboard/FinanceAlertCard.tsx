"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { buildSnapshot, deriveFinanceAlert, type AnalyzableTransaction } from "@/lib/finances/analyze";

// "Financial Alert" (Sprint 6, the Unified Dashboard) — reads the store's
// already-hydrated transactions (no fetch, no LLM: buildSnapshot/
// deriveFinanceAlert are pure and run client-side, same as the CFO panel's
// own math). Always occupies its dedicated bento cell — same reasoning
// AIBriefing's own `bare` mode states for itself: this card's frame is
// already placed in the grid, so returning null when there's nothing to
// flag would leave an empty box rather than actually disappearing. A quiet
// "nothing flagged" line fills that space instead of a manufactured
// all-clear banner.
export function FinanceAlertCard() {
  const transactions = useAtlasStore((s) => s.transactions);

  const alert = useMemo(() => {
    const analyzable: AnalyzableTransaction[] = transactions.map((t) => ({
      amount: t.amount,
      type: t.type,
      category: t.category,
      date: t.date,
    }));
    return deriveFinanceAlert(buildSnapshot(analyzable));
  }, [transactions]);

  return (
    <div className="flex h-full flex-col gap-2.5">
      <p
        className={
          alert
            ? "flex items-center gap-2 text-sm font-medium text-accent-family"
            : "flex items-center gap-2 text-sm font-medium text-muted"
        }
      >
        <AlertTriangle size={16} aria-hidden />
        התראה פיננסית
      </p>
      {alert ? (
        <>
          <p className="text-sm leading-relaxed text-foreground/80">{alert.message}</p>
          <Link
            href="/areas/finances"
            className="focus-ring w-fit rounded text-xs text-gold-ink transition-colors hover:opacity-80"
          >
            לפירוט המלא
          </Link>
        </>
      ) : (
        <p className="text-xs text-muted">שום דבר לא בולט החודש — נראה תקין.</p>
      )}
    </div>
  );
}
