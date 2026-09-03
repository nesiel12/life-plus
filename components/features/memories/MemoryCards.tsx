"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ImagePlus, Loader2, Sparkles } from "lucide-react";
import { useInsights } from "@/hooks/useInsights";
import { usePhotoPicker } from "@/hooks/usePhotoPicker";
import { yearsAgoLabel } from "@/lib/memories/anniversary";

interface Memory {
  id: string;
  takenAt: string;
  yearsAgo: number;
  width: number;
  height: number;
  imageUrl: string;
  caption: string | null;
}

interface MemoriesResponse {
  connected: boolean;
  corpusSize: number;
  memories: Memory[];
}

const FALLBACK: MemoriesResponse = { connected: false, corpusSize: 0, memories: [] };

// Memory Cards for the dashboard.
//
// Framing matters here and is deliberate: this is "the photos you've given
// Atlas", not "your Google Photos". Google removed the ability to scan a
// library by date in March 2025, so anything implying Atlas can see the whole
// library would be a lie the empty state eventually exposes.
export function MemoryCards() {
  const reduce = useReducedMotion();
  const { data, refresh } = useInsights<MemoriesResponse>("/api/photos/memories", FALLBACK);
  const picker = usePhotoPicker(refresh);

  const busy = picker.state === "opening" || picker.state === "waiting" || picker.state === "importing";

  const addButton = (
    <button
      onClick={() => picker.start("memories")}
      disabled={busy}
      className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-fill-subtle disabled:opacity-40"
    >
      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ImagePlus size={13} aria-hidden />}
      {picker.state === "waiting"
        ? "ממתין לבחירה…"
        : picker.state === "importing"
          ? "מייבא…"
          : "הוסף תמונות"}
    </button>
  );

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Sparkles size={15} className="text-gold-ink" aria-hidden />
          זיכרונות
        </p>
        {addButton}
      </div>

      {picker.needsConnect && (
        <a
          href="/api/photos/connect"
          className="focus-ring rounded-lg bg-gold-soft px-3 py-2 text-center text-xs font-medium text-gold-ink"
        >
          חבר את Google Photos כדי להוסיף תמונות
        </a>
      )}

      {picker.error && !picker.needsConnect && (
        <p role="alert" className="text-xs text-accent-family">
          {picker.error}
        </p>
      )}

      {picker.result && picker.state === "done" && (
        <p className="text-xs text-accent-health">
          נוספו {picker.result.imported} תמונות
          {picker.result.skipped > 0 && ` · ${picker.result.skipped} דולגו`}
        </p>
      )}

      {data.corpusSize === 0 ? (
        // Two genuinely different empty states. Conflating them would make a
        // working feature look broken on any day with no match.
        <p className="text-xs leading-relaxed text-muted">
          עדיין לא הוספת תמונות. Atlas מציג זיכרונות מתוך התמונות שתבחר לתת לו — הוא לא סורק את
          Google Photos שלך.
        </p>
      ) : data.memories.length === 0 ? (
        <p className="text-xs text-muted">
          אין זיכרון מהתאריך הזה מתוך {data.corpusSize} התמונות ששמורות.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.memories.map((memory, i) => (
            <motion.figure
              key={memory.id}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: Math.min(i * 0.08, 0.3), ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden rounded-2xl border border-hairline-card bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={memory.imageUrl}
                alt=""
                width={memory.width}
                height={memory.height}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              <figcaption className="flex flex-col gap-1 p-3">
                <span className="text-xs font-medium text-gold-ink">
                  {yearsAgoLabel(memory.yearsAgo)}
                </span>
                {memory.caption && (
                  <span className="text-xs leading-relaxed text-foreground/80">{memory.caption}</span>
                )}
                <span className="ltr text-[0.65rem] text-muted">
                  {new Date(memory.takenAt).toLocaleDateString("he-IL", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      )}
    </div>
  );
}
