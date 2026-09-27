"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { Sidebar, MobileTabBar, MobileThemeToggle } from "@/components/layout/Sidebar";
import { AppWindow } from "@/components/layout/AppWindow";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { AICompanion } from "@/components/layout/AICompanion";
import { VoiceAssistantModal } from "@/components/features/voice/VoiceAssistantModal";
import { QuickCapture } from "@/components/features/QuickCapture";
import { OnboardingFlow } from "@/components/features/OnboardingFlow";
import { WelcomeSlides } from "@/components/features/WelcomeSlides";
import { Logo } from "@/components/ui/Logo";
import { useAtlasStore } from "@/store/useAtlasStore";
import { getInitialState } from "@/app/actions/bootstrap";
import { setTimezoneAction } from "@/app/actions/timezone";
import { isConfirmedSignedOut } from "@/lib/query/offlineStore";
import { offlineBootstrapQueryKey, type OfflineBootstrapSnapshot } from "@/lib/query/offlineKeys";
import { OfflineBanner, OfflineBootstrapPersister } from "@/components/layout/OfflineShell";
import { hydrateFromOfflineSnapshot } from "@/lib/query/offlineSnapshot";
import { warmInsightsCache } from "@/lib/api/warmInsights";
import { onIdle } from "@/lib/dom/idle";
import { InstallPwaBanner } from "@/components/ui/InstallPwaButton";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";

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
  // True while the store holds the device's offline snapshot (an offline
  // cold start) rather than a live bootstrap — a real, if possibly stale,
  // copy of every domain, superseded the moment a real online load succeeds.
  const [offlineSnapshot, setOfflineSnapshot] = useState(false);
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();

  useEffect(() => {
    if (isAuthPage || (hydrated && !offlineSnapshot) || status !== "authenticated") return;
    let cancelled = false;
    setLoadError(false);
    getInitialState()
      .then((state) => {
        if (cancelled) return;
        hydrate(state);
        setOfflineSnapshot(false);
      })
      .catch((err) => {
        console.error("Failed to load Atlas data:", err);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthPage, hydrated, offlineSnapshot, status, hydrate, retryToken]);

  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  // Once, after a real (not offline-snapshot) bootstrap: warms every
  // screen's own AI-insight fetch (lib/api/warmInsights.ts) at idle, so the
  // first visit to a tab this session already has its data cached instead
  // of starting the request only once the tab mounts.
  const warmedInsights = useRef(false);
  useEffect(() => {
    if (!hydrated || offlineSnapshot || warmedInsights.current) return;
    warmedInsights.current = true;
    return onIdle(warmInsightsCache);
  }, [hydrated, offlineSnapshot]);

  // With the service worker, a cold start with no connection now renders this
  // shell from cache — and next-auth, unable to reach the server, reports
  // "unauthenticated". Rendering the page un-hydrated would claim the
  // person's data is empty ("המעבדה ריקה"), so tell a failed session check
  // apart from a real signed-out answer and say "no connection" instead.
  const [serverUnreachable, setServerUnreachable] = useState(false);
  useEffect(() => {
    if (isAuthPage || status !== "unauthenticated") {
      setServerUnreachable(false);
      return;
    }
    let cancelled = false;
    void isConfirmedSignedOut().then((signedOut) => {
      if (!cancelled) setServerUnreachable(!signedOut);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthPage, status]);

  // Offline cold start: once the IndexedDB restore has landed, open the app
  // on the saved bootstrap snapshot instead of a "no connection" dead end.
  useEffect(() => {
    if (!serverUnreachable || isRestoring || hydrated) return;
    if (hydrateFromOfflineSnapshot(queryClient.getQueryData<OfflineBootstrapSnapshot>(offlineBootstrapQueryKey))) setOfflineSnapshot(true);
  }, [serverUnreachable, isRestoring, hydrated, queryClient]);

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
    if (!hydrated || offlineSnapshot) return;
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
  }, [hydrated, offlineSnapshot, storedTimezone, setStoredTimezone]);

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
      if (offlineSnapshot && hydrated) {
        const savedAt = queryClient.getQueryData<OfflineBootstrapSnapshot>(offlineBootstrapQueryKey)?.savedAt;
        return (
          <div className="flex min-h-screen max-w-full overflow-x-clip">
            <div className="contents print:hidden">
              <Sidebar />
              <MobileTabBar />
              <MobileThemeToggle />
            </div>
            <AppWindow className="min-w-0 flex-1 pb-24 sm:pb-0 print:pb-0">
              <OfflineBanner savedAt={savedAt} />
              {children}
            </AppWindow>
          </div>
        );
      }
      // Still reading the device snapshot — don't flash "no connection" first.
      if (serverUnreachable && isRestoring) {
        return (
          <div className="flex min-h-screen items-center justify-center">
            <Logo size={32} className="animate-pulse" />
          </div>
        );
      }
      if (serverUnreachable) {
        return (
          <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
            <Logo size={32} />
            <p className="text-lg font-medium text-foreground">אין חיבור לאינטרנט.</p>
            <p className="max-w-sm text-sm text-muted">הנתונים שלך לא נמחקו — הם פשוט לא נטענו. נסה שוב כשהחיבור יחזור.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-opacity hover:opacity-80"
            >
              נסה שוב
            </button>
          </div>
        );
      }
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

    // offlineSnapshot here means the connection is back and the real
    // bootstrap is loading: the store still holds only the learning slice
    // (with onboardingComplete at its false default), so the full chrome must
    // not render on it yet.
    if (!hydrated || offlineSnapshot) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <Logo size={32} className="animate-pulse" />
        </div>
      );
    }

    return (
      <div className="flex min-h-screen max-w-full overflow-x-clip">
        {/* The app chrome is screen furniture: printing a page (הדפסה לשבת)
            must put the page's own content on the paper and nothing else.
            `contents` keeps the flex layout identical on screen; `print:hidden`
            removes the whole wrapper from the printed document. */}
        <div className="contents print:hidden">
          <Sidebar />
          <MobileTabBar />
          <MobileThemeToggle />
          <AICompanion />
          <VoiceAssistantModal />
          <QuickCapture />
          <WelcomeSlides />
          <OnboardingFlow />
          <InstallPwaBanner />
          {!offlineSnapshot && <OfflineBootstrapPersister />}
        </div>
        <AppWindow className="min-w-0 flex-1 pb-24 sm:pb-0 print:pb-0">{children}</AppWindow>
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
