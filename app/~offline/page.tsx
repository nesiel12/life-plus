import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "אין חיבור · Life Plus" };

// The service worker's fallback for a page that was never cached. Static and
// outside the auth middleware, so it is precached and renders with no network.
export default function OfflinePage() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <WifiOff size={28} className="text-muted" aria-hidden />
      <h1 className="text-lg font-semibold text-foreground">אין חיבור לאינטרנט</h1>
      <p className="max-w-sm text-sm text-muted">
        הדף הזה עוד לא נשמר במכשיר. נסה שוב כשהחיבור יחזור.
      </p>
    </main>
  );
}
