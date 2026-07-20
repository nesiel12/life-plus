"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NavBar } from "@/components/layout/NavBar";
import { AICompanion } from "@/components/layout/AICompanion";
import { QuickCapture } from "@/components/features/QuickCapture";
import { OnboardingFlow } from "@/components/features/OnboardingFlow";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";

  if (isAuthPage) {
    return <>{children}</>;
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
