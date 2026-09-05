"use client";

import { useEffect } from "react";
import { Logo } from "@/components/ui/Logo";

// The route-level error boundary.
//
// It previously showed "משהו השתבש." and nothing else, which is precisely
// what made a crash like the Torah Space one impossible to act on: the real
// message went to console.error, the screen said nothing, and there was no
// way to tell one failure from another without opening devtools.
//
// So: the digest is always shown (it is a short opaque id that correlates
// this render with the server log line, and leaks nothing), and in
// development the actual message and stack are shown inline. Production
// keeps the message hidden, since a raw error string can carry internals a
// user shouldn't see — but never at the cost of showing *nothing*.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled render error:", error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Logo size={32} />
      <p className="text-lg font-medium text-foreground">משהו השתבש.</p>
      <p className="text-sm text-muted">Life Plus נתקל בבעיה בלתי צפויה. אפשר לנסות שוב.</p>

      {error.digest && (
        <p className="ltr font-mono text-xs text-muted">
          קוד תקלה: <span className="select-all">{error.digest}</span>
        </p>
      )}

      {isDev && (
        <details className="mt-2 w-full max-w-2xl text-start">
          <summary className="cursor-pointer text-xs text-gold-ink">פרטי השגיאה (מצב פיתוח בלבד)</summary>
          <pre className="ltr mt-2 max-h-64 overflow-auto rounded-lg border border-hairline-card bg-surface-sunken p-3 text-xs leading-relaxed text-foreground/80">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
        </details>
      )}

      <button
        onClick={reset}
        className="glass-control focus-ring mt-2 rounded-lg px-4 py-2 text-sm text-foreground"
      >
        נסה שוב
      </button>
    </div>
  );
}
