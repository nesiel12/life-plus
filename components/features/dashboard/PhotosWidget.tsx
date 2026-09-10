"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, ImagePlus, Images, Loader2 } from "lucide-react";
import { useInsights } from "@/hooks/useInsights";
import { usePhotoPicker } from "@/hooks/usePhotoPicker";
import type { RecentPhotosResponse } from "@/app/api/photos/recent/route";

const FALLBACK: RecentPhotosResponse = { connected: false, corpusSize: 0, photos: [] };

// The dashboard's Google Photos surface. A tight grid of the most recent
// photos the user has given the app, plus one-tap add. Framing is deliberate:
// "the photos you've shared", not "your library" — Google no longer lets an
// app scan the whole library.
export function PhotosWidget() {
  const { data, refresh } = useInsights<RecentPhotosResponse>("/api/photos/recent", FALLBACK);
  const picker = usePhotoPicker(refresh);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const busy = picker.state === "opening" || picker.state === "waiting" || picker.state === "importing";

  const add = (
    <button
      onClick={() => picker.start("memories")}
      disabled={busy}
      className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-fill-subtle disabled:opacity-40"
    >
      {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <ImagePlus size={12} aria-hidden />}
      {picker.state === "waiting" ? "ממתין…" : picker.state === "importing" ? "מייבא…" : "הוסף"}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Images size={16} className="text-gold-ink" aria-hidden />
          תמונות
        </p>
        {add}
      </div>

      {picker.connectResult?.status === "connected" && (
        <p role="status" className="mb-2 rounded-lg bg-accent-health/12 px-3 py-2 text-xs font-medium text-accent-health">
          Google Photos חובר.
        </p>
      )}
      {picker.connectResult && picker.connectResult.status !== "connected" && (
        <p role="alert" className="mb-2 rounded-lg bg-accent-family/10 px-3 py-2 text-xs text-accent-family">
          החיבור ל-Google Photos נכשל{picker.connectResult.reason ? `: ${picker.connectResult.reason}` : ""}
        </p>
      )}
      {picker.needsConnect && (
        <a
          href="/api/photos/connect?return=/"
          className="focus-ring mb-2 rounded-lg bg-gold-soft px-3 py-2 text-center text-xs font-medium text-gold-ink"
        >
          חבר את Google Photos
        </a>
      )}
      {picker.error && !picker.needsConnect && (
        <p role="alert" className="mb-2 text-xs text-accent-family">
          {picker.error}
        </p>
      )}
      {picker.pickerUri && picker.state === "waiting" && (
        <a
          href={picker.pickerUri}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring mb-2 inline-flex items-center gap-1 self-start text-xs text-gold-ink hover:opacity-80"
        >
          פתח את בורר התמונות
          <ExternalLink size={11} aria-hidden />
        </a>
      )}

      {!data || (data.corpusSize === 0 && !picker.needsConnect) ? (
        <p className="text-xs leading-relaxed text-muted">
          עדיין לא הוספת תמונות. התמונות שתשתף יופיעו כאן ובזיכרונות.
        </p>
      ) : data.photos.length === 0 ? null : (
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {data.photos.slice(0, 9).map((photo) => (
            <button
              key={photo.id}
              onClick={() => setLightbox(photo.imageUrl)}
              className="focus-ring aspect-square overflow-hidden rounded-lg bg-fill-subtle"
              aria-label={photo.caption ?? "תמונה"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.imageUrl}
                alt={photo.caption ?? ""}
                loading="lazy"
                className="h-full w-full object-cover transition-transform hover:scale-105"
              />
            </button>
          ))}
        </div>
      )}

      {data && data.corpusSize > 9 && (
        <Link
          href="/timeline"
          className="focus-ring mt-2 self-start text-xs text-muted transition-colors hover:text-foreground"
        >
          {data.corpusSize} תמונות בסך הכול
        </Link>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
