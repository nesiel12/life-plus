"use client";

import { useEffect } from "react";
import { Logo } from "@/components/ui/Logo";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={32} />
      <p className="text-lg font-medium text-foreground">משהו השתבש.</p>
      <p className="text-sm text-muted">אטלס נתקל בבעיה בלתי צפויה. אפשר לנסות שוב.</p>
      <button
        onClick={reset}
        className="mt-2 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-opacity hover:opacity-80"
      >
        נסה שוב
      </button>
    </div>
  );
}
