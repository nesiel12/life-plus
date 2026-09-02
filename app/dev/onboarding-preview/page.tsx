import { Suspense } from "react";
import { notFound } from "next/navigation";
import { OnboardingPreviewShell } from "@/components/features/OnboardingPreviewShell";

// Dev-only visual harness for OnboardingWizard, reachable with no session.
// Deliberately NOT the real modal path through OnboardingFlow/AppShell:
// that path requires an authenticated hydrate() to ever mount (see
// AppShell's status==="authenticated" gate), and this route's whole point is
// to render the wizard without one. middleware.ts's matcher only covers
// "/", "/timeline", "/areas", "/calendar" — this path is already outside it,
// so no redirect-to-login happens here regardless of this guard.
//
// The guard itself is server-side and unconditional: notFound() throws
// before any client code ships, so `npm run build` / `next start` serves a
// real 404 in production — there is no client-only toggle to strip or forget.
export default function OnboardingPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  // useSearchParams (for ?instant=1) requires a Suspense boundary in the
  // App Router, or the production build fails even though this route itself
  // 404s in production.
  return (
    <Suspense fallback={null}>
      <OnboardingPreviewShell />
    </Suspense>
  );
}
