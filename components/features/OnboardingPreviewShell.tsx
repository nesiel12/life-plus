"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { OnboardingWizard } from "@/components/features/OnboardingWizard";

// Renders the wizard in the same panel chrome OnboardingFlow gives it
// (max-w-xl, p-8, the modal surface classes) without Modal/AppShell/the
// store's real save action in the loop — this page has no session, so
// saveOnboardingWizardAction would just throw on submit. onDone here logs
// instead of dismissing anything, which is the correct behavior for a
// standalone visual harness.
export function OnboardingPreviewShell() {
  const [completedCount, setCompletedCount] = useState(0);
  // ?instant=1 forces the step transition to skip its exit animation
  // (reduceStepMotion on OnboardingWizard). This tool's own browser pane
  // never reports its tab as visible, which permanently stalls
  // framer-motion's rAF-driven exit-complete detection — real users are
  // unaffected, this is purely so a step swap can be captured deterministically
  // for a screenshot in that environment.
  const instant = useSearchParams().get("instant") === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-xl">
        <p className="mb-3 text-center text-xs text-muted">
          תצוגה מקדימה למפתחים — /dev/onboarding-preview, לא זמין מחוץ ל־development
          {completedCount > 0 && ` · הושלם ${completedCount} פעם(ים) (לא נשמר, אין הפעלה)`}
        </p>
        <div className="glass-card flex flex-col gap-6 rounded-2xl p-8">
          <OnboardingWizard
            key={completedCount}
            onDone={() => setCompletedCount((n) => n + 1)}
            reduceStepMotion={instant}
          />
        </div>
      </div>
    </div>
  );
}
