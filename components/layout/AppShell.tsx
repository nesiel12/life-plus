"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { Sidebar, MobileTabBar } from "@/components/layout/Sidebar";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { AICompanion } from "@/components/layout/AICompanion";
import { QuickCapture } from "@/components/features/QuickCapture";
import { OnboardingFlow } from "@/components/features/OnboardingFlow";
import { Logo } from "@/components/ui/Logo";
import { useAtlasStore } from "@/store/useAtlasStore";
import { getInitialState } from "@/app/actions/bootstrap";
import { setTimezoneAction } from "@/app/actions/timezone";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";
  const { status } = useSession();
  const hydrated = useAtlasStore((s) => s.hydrated);
  const hydrate = useAtlasStore((s) => s.hydrate);
  // Previously a failed bootstrap fetch only logged to the console and left
  // the user stuck on the pulsing-logo loading state indefinitely — a DB
  // blip meant the app just never loaded, with no way to recover short of
  // knowing to hard-refresh. Now it's a real, retryable error state.
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (isAuthPage || hydrated || status !== "authenticated") return;
    let cancelled = false;
    setLoadError(false);
    getInitialState()
      .then((state) => {
        if (!cancelled) hydrate(state);
      })
      .catch((err) => {
        console.error("Failed to load Atlas data:", err);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthPage, hydrated, status, hydrate, retryToken]);

  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  // Keep the stored timezone in step with the device.
  //
  // Scheduled work runs with no browser, so the server has no other way to
  // know what hour it is where the user is — and a "morning briefing" sent at
  // the server's 07:00 is just a notification at a random time. Written only
  // when it differs from what is stored, so this is one write on first load
  // and one more if the user moves timezone, not a write per app open.
  const storedTimezone = useAtlasStore((s) => s.personalDNA.timezone);
  const setStoredTimezone = useAtlasStore((s) => s.setPersonalDnaTimezone);
  useEffect(() => {
    if (!hydrated) return;
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!deviceTimezone || deviceTimezone === storedTimezone) return;
    setTimezoneAction(deviceTimezone)
      .then((saved) => {
        if (saved) setStoredTimezone(saved);
      })
      .catch(() => {
        // Best-effort: the engine falls back to the app default zone, which
        // is right for most of this app's users anyway. Never block the UI.
      });
  }, [hydrated, storedTimezone, setStoredTimezone]);

  // The splash overlay self-manages (once per session, skippable) and sits
  // above whichever state the shell is in, so it renders alongside every
  // branch below rather than being one more early return.
  const content = (() => {
    if (isAuthPage) {
      return <>{children}</>;
    }

    // Protected routes are already gated by middleware.ts's matcher, which
    // redirects an unauthenticated visitor to /login before this ever renders.
    // Routes outside that matcher (a mistyped/stale URL hitting not-found.tsx,
    // for instance) reach here in "unauthenticated" state — without this,
    // those pages hung on the hydration spinner forever, since hydration only
    // ever runs for an authenticated session.
    if (status === "unauthenticated") {
      return <>{children}</>;
    }

    if (loadError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <Logo size={32} />
          <p className="text-lg font-medium text-foreground">לא הצלחנו לטעון את הנתונים שלך.</p>
          <p className="text-sm text-muted">בדוק את החיבור ונסה שוב.</p>
          <button
            onClick={retry}
            className="mt-2 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-opacity hover:opacity-80"
          >
            נסה שוב
          </button>
        </div>
      );
    }

    if (!hydrated) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <Logo size={32} className="animate-pulse" />
        </div>
      );
    }

    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1 pb-20 sm:pb-0">{children}</div>
        <MobileTabBar />
        <AICompanion />
        <QuickCapture />
        <OnboardingFlow />
      </div>
    );
  })();

  return (
    <>
      <SplashScreen />
      {content}
    </>
  );
}
