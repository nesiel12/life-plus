"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface RedirectUris {
  origin: string;
  signIn: string;
  photos: string;
  nextAuthUrl: string | null;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2 rounded-lg bg-fill-subtle px-2.5 py-1.5">
        <code className="ltr min-w-0 flex-1 truncate text-xs text-foreground" dir="ltr">
          {value}
        </code>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => {}
            );
          }}
          aria-label={`העתק ${label}`}
          className="focus-ring grid size-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:text-foreground"
        >
          {copied ? <Check size={13} className="text-accent-health" aria-hidden /> : <Copy size={13} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

/**
 * "חיבורי Google" — shows the exact OAuth redirect URIs this deployment
 * sends, so a `redirect_uri_mismatch` is a copy-paste away from fixed. See
 * docs/GOOGLE_OAUTH_SETUP.md.
 */
export function GoogleConnections() {
  const [uris, setUris] = useState<RedirectUris | null>(null);
  const [failed, setFailed] = useState(false);
  const [photosResult, setPhotosResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/redirect-uris")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data) => !cancelled && setUris(data as RedirectUris))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // The Google Photos OAuth callback redirects here with ?photos=… — show it,
  // then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const photos = params.get("photos");
    if (!photos) return;
    const reason = params.get("reason");
    if (photos === "connected") setPhotosResult({ ok: true, text: "Google Photos חובר בהצלחה." });
    else setPhotosResult({ ok: false, text: `החיבור נכשל${reason ? `: ${reason}` : "."}` });
    params.delete("photos");
    params.delete("reason");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  const looksLocal = uris?.origin.includes("localhost");

  return (
    <GlassCard>
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
        <Link2 size={16} className="text-accent-career" aria-hidden />
        חיבורי Google
      </p>
      <p className="mb-4 text-xs text-muted">
        אם התחברות ל-Google או ל-Google Photos נופלת עם{" "}
        <code className="ltr">redirect_uri_mismatch</code> — הוסף את שתי הכתובות הבאות במדויק
        תחת “Authorized redirect URIs” ב-Google Cloud Console.
      </p>

      {failed ? (
        <p className="text-xs text-muted">לא הצלחנו לטעון את הכתובות.</p>
      ) : !uris ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          טוען…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <CopyRow label="התחברות (Sign-in)" value={uris.signIn} />
          <CopyRow label="Google Photos" value={uris.photos} />

          {looksLocal && (
            <p className="rounded-lg border border-gold-line bg-gold-soft px-3 py-2 text-xs text-gold-ink">
              הכתובות מצביעות ל-localhost. בסביבת הייצור צריך להגדיר את המשתנה{" "}
              <code className="ltr">NEXTAUTH_URL</code> לכתובת הציבורית של האפליקציה, ואז לפרוס מחדש.
            </p>
          )}

          {photosResult && (
            <p
              role={photosResult.ok ? "status" : "alert"}
              className={
                photosResult.ok
                  ? "rounded-lg bg-accent-health/12 px-3 py-2 text-xs font-medium text-accent-health"
                  : "rounded-lg bg-accent-family/10 px-3 py-2 text-xs text-accent-family"
              }
            >
              {photosResult.text}
            </p>
          )}

          <p className="text-xs text-muted">
            בנוסף, ל-Google Photos צריך להפעיל את <span className="ltr font-medium">Photos Picker API</span> בפרויקט,
            ולוודא שמסך ההסכמה כולל את ההיקף{" "}
            <code className="ltr">photospicker.mediaitems.readonly</code>. אם האפליקציה במצב
            “Testing”, רק משתמשי-בדיקה מאושרים יוכלו לחבר.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1 text-xs text-gold-ink hover:opacity-80"
            >
              OAuth credentials
              <ExternalLink size={11} aria-hidden />
            </a>
            <a
              href="https://console.cloud.google.com/apis/library/photospicker.googleapis.com"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1 text-xs text-gold-ink hover:opacity-80"
            >
              הפעל Photos Picker API
              <ExternalLink size={11} aria-hidden />
            </a>
            <a
              href="/api/photos/connect?return=/settings"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-hairline-card px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
            >
              חבר את Google Photos
            </a>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
