"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Target, HeartHandshake, ArrowLeft } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { pickTopGoals } from "@/lib/dashboard/contextData";
import { buildOutreachDrafts } from "@/lib/intelligence/crossModule/familyOutreach";
import { useInsights } from "@/hooks/useInsights";
import { useNow } from "@/hooks/useNow";

interface NextStepsResponse {
  steps: string[];
}

const EMPTY_STEPS: NextStepsResponse = { steps: [] };

/**
 * The one thing the dashboard leads with now: the single highest-priority
 * goal's next milestone (lib/dashboard/contextData.ts's pickTopGoals — the
 * same ranker TopThreeCard already used), with 2-3 AI-generated execution
 * steps underneath instead of a generic status summary. A capped, 1-line
 * relationship-outreach note rides along at the bottom (buildOutreachDrafts —
 * the same function FamilyCard uses, so this line and FamilyCard's full card
 * in SecondaryZone can never disagree about who needs a check-in).
 */
export function HeroFocusCard() {
  const goals = useAtlasStore((s) => s.goals);
  const people = useAtlasStore((s) => s.people);
  const focus = useMemo(() => pickTopGoals(goals, 1)[0] ?? null, [goals]);

  const now = useNow(5 * 60_000);
  const drafts = useMemo(() => (now ? buildOutreachDrafts(people, now, 2) : []), [people, now]);

  const { data: steps } = useInsights<NextStepsResponse>(
    `/api/goals/next-steps?goalId=${focus?.goal.id ?? ""}&milestoneId=${focus?.next.id ?? ""}`,
    EMPTY_STEPS,
    [focus?.goal.id, focus?.next.id]
  );

  if (!focus) {
    return (
      <section className="glass-card mb-6 rounded-3xl p-6 text-center sm:p-8">
        <p className="text-sm text-muted">אין כרגע יעד פעיל — אפשר להתחיל אחד בלוח היעדים.</p>
        <Link href="#goals" className="focus-ring mt-2 inline-flex items-center gap-1 text-xs text-gold-ink">
          להוספת יעד
          <ArrowLeft size={12} aria-hidden />
        </Link>
      </section>
    );
  }

  return (
    <section className="glass-card mb-6 rounded-3xl border-gold-line p-6 sm:p-8">
      <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted">
        <Target size={14} className="text-gold-ink" aria-hidden />
        עכשיו הכי חשוב · {categoryLabel(focus.goal.category)}
      </p>
      <h2 className="text-2xl font-bold leading-snug text-foreground sm:text-3xl">{focus.next.title}</h2>
      <p className="mt-1 text-sm text-muted">מתוך: {focus.goal.title}</p>

      {steps && steps.steps.length > 0 && (
        <ol className="mt-5 flex flex-col gap-2">
          {steps.steps.slice(0, 3).map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/90">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-gold-soft text-[0.7rem] font-semibold text-gold-ink">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}

      {drafts.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
          <HeartHandshake size={12} className="text-accent-family" aria-hidden />
          {drafts.length === 1 ? `כדאי ליצור קשר עם ${drafts[0].name}` : `${drafts.length} אנשים שכדאי ליצור איתם קשר`}
        </p>
      )}
    </section>
  );
}
