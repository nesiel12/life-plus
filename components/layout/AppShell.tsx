"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { NavBar } from "@/components/layout/NavBar";
import { AICompanion } from "@/components/layout/AICompanion";
import { QuickCapture } from "@/components/features/QuickCapture";
import { OnboardingFlow } from "@/components/features/OnboardingFlow";
import { Logo } from "@/components/ui/Logo";
import { useAtlasStore } from "@/store/useAtlasStore";
import { getInitialState } from "@/app/actions/bootstrap";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";
  const { status } = useSession();
  const hydrated = useAtlasStore((s) => s.hydrated);
  const hydrate = useAtlasStore((s) => s.hydrate);

  useEffect(() => {
    if (isAuthPage || hydrated || status !== "authenticated") return;
    getInitialState()
      .then(hydrate)
      .catch((err) => {
        console.error("Failed to load Atlas data:", err);
      });
  }, [isAuthPage, hydrated, status, hydrate]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Logo size={32} className="animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <NavBar />
      {children}
      <AICompanion />
      <QuickCapture />
      <OnboardingFlow />
    </>
  );
}
