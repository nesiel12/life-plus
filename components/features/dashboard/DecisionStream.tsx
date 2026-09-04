"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, HeartHandshake, Target, Wallet } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { buildSnapshot, type AnalyzableTransaction } from "@/lib/finances/analyze";
import { topDecisions, type Decision, type DecisionKind } from "@/lib/lifeos/decisionStream";

const DEFAULT_STALE_THRESHOLD_DAYS = 7;

const KIND_ICON: Record<DecisionKind, typeof Clock> = {
  "overdue-task": Clock,
  finance: Wallet,
  "priority-task": AlertTriangle,
  "stale-contact": HeartHandshake,
  "stalled-goal": Target,
};

const KIND_ACCENT: Record<DecisionKind, string> = {
  "overdue-task": "text-accent-family",
  finance: "text-accent-finance",
  "priority-task": "text-accent-time",
  "stale-contact": "text-accent-family",
  "stalled-goal": "text-accent-faith",
};

function DecisionRow({ decision }: { decision: Decision }) {
  const Icon = KIND_ICON[decision.kind];
  return (
    <Link
      href={decision.href}
      className="focus-ring group/row flex min-w-0 items-center gap-3 rounded-xl border border-hairline-card bg-surface-sunken/60 px-3.5 py-3 transition-colors hover:bg-fill-subtle"
    >
      <Icon size={16} className={`shrink-0 ${KIND_ACCENT[decision.kind]}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{decision.title}</span>
        <span className="block truncate text-xs text-muted">{decision.detail}</span>
      </span>
      <ArrowLeft
        size={14}
        className="shrink-0 text-muted opacity-0 transition-opacity group-hover/row:opacity-100"
        aria-hidden
      />
    </Link>
  );
}

// The Decision Stream (LifeOS Pillar 3) — the dashboard's answer to "zero
// cognitive overload": at most three things, each one already true and each
// one linking to where it's actually resolved.
//
// The ranking lives in lib/lifeos/decisionStream.ts, pure and tested. This
// component only renders it, and reads entirely from the already-hydrated
// store — no fetch, no AI call, so it paints with the rest of the page
// instead of arriving late.
export function DecisionStream() {
  const tasks = useAtlasStore((s) => s.tasks);
  const goals = useAtlasStore((s) => s.goals);
  const people = useAtlasStore((s) => s.people);
  const transactions = useAtlasStore((s) => s.transactions);
  const personalDNA = useAtlasStore((s) => s.personalDNA);

  const decisions = useMemo(() => {
    const analyzable: AnalyzableTransaction[] = transactions.map((t) => ({
      amount: t.amount,
      type: t.type,
      category: t.category,
      date: t.date,
    }));
    return topDecisions({
      tasks,
      goals,
      people,
      snapshot: buildSnapshot(analyzable),
      staleThresholdDays: personalDNA.familyCheckInIntervalDays ?? DEFAULT_STALE_THRESHOLD_DAYS,
      now: new Date(),
    });
  }, [tasks, goals, people, transactions, personalDNA]);

  return (
    <div className="flex h-full flex-col">
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
        <Target size={16} className="text-gold-ink" aria-hidden />
        מה דורש ממך החלטה
      </p>

      {decisions.length === 0 ? (
        // Genuinely nothing pending is worth saying plainly — it's the state
        // the whole list exists to reach.
        <p className="flex items-center gap-2 text-sm text-muted">
          <CheckCircle2 size={15} className="text-accent-health" aria-hidden />
          שום דבר לא ממתין להחלטה שלך.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {decisions.map((decision) => (
            <li key={decision.id} className="min-w-0">
              <DecisionRow decision={decision} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
