"use client";

import { useEffect, useState } from "react";
import { Quote as QuoteIcon } from "lucide-react";
import { quoteForDate, type Quote } from "@/lib/motivation/quotes";

// One curated line a day, with an accurate source. Stable for the day and the
// same for everyone. Picked client-side after mount so SSR and the client
// never disagree on the date.
export function MotivationCard() {
  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    setQuote(quoteForDate(new Date()));
  }, []);

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <QuoteIcon size={18} className="text-gold-ink" aria-hidden />
      {quote ? (
        <>
          <p className="text-[0.95rem] font-medium leading-relaxed text-foreground">{quote.text}</p>
          <p className="text-xs text-muted">— {quote.source}</p>
        </>
      ) : (
        <div className="h-12 animate-pulse rounded bg-fill-subtle" aria-hidden />
      )}
    </div>
  );
}
