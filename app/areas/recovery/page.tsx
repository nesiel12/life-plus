"use client";

import { BackToHome } from "@/components/layout/BackToHome";
import { RecoveryLockGate } from "@/components/features/recovery/RecoveryLockGate";
import { RecoverySpace } from "@/components/features/recovery/RecoverySpace";

/**
 * The recovery space.
 *
 * A separate route rather than a dashboard widget, and gated as a whole: the
 * point is that nothing about it is visible — or even loaded — until the
 * device biometric has been presented.
 */
export default function RecoveryPage() {
  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      {/* Neutral heading, deliberately. The whole feature exists so that
          someone glancing at the screen learns nothing — a title reading
          "גמילה" above a lock screen would give away exactly the thing the
          lock is there to protect. The specifics appear only after unlock. */}
      <h1 className="mb-1 text-2xl font-medium tracking-tight">מרחב אישי</h1>
      <p className="mb-8 max-w-xl text-sm text-muted">
        נעול מאחורי אימות של המכשיר. שום דבר מכאן לא נטען לדף לפני שפותחים.
      </p>

      <RecoveryLockGate>{({ lock }) => <RecoverySpace onLock={lock} />}</RecoveryLockGate>
    </main>
  );
}
