"use client";

import { BackToHome } from "@/components/layout/BackToHome";
import { RecoveryLockGate } from "@/components/features/recovery/RecoveryLockGate";
import { RecoverySpace } from "@/components/features/recovery/RecoverySpace";
import { Psychologist } from "@/components/features/recovery/Psychologist";
import { useT } from "@/lib/i18n/useT";

/**
 * The recovery space.
 *
 * A separate route rather than a dashboard widget, and gated as a whole: the
 * point is that nothing about it is visible — or even loaded — until the
 * device biometric has been presented.
 */
export default function RecoveryPage() {
  const t = useT();
  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      {/* Neutral heading, deliberately. The whole feature exists so that
          someone glancing at the screen learns nothing — a title reading
          "גמילה" above a lock screen would give away exactly the thing the
          lock is there to protect. The specifics appear only after unlock. */}
      <h1 className="mb-1 text-2xl font-medium tracking-tight">{t("page.recovery.title")}</h1>
      <p className="mb-8 max-w-xl text-sm text-muted">
        מרחב רגשי ומעקב אישי, נעולים מאחורי אימות של המכשיר. שום דבר מכאן לא נטען לדף לפני שפותחים.
      </p>

      <RecoveryLockGate>
        {({ lock }) => (
          <div className="flex flex-col gap-6">
            <Psychologist />
            <RecoverySpace onLock={lock} />
          </div>
        )}
      </RecoveryLockGate>
    </main>
  );
}
