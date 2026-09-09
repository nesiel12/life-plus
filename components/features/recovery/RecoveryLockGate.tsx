"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, Lock, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface LockStatus {
  enrolled: boolean;
  unlocked: boolean;
  devices: { credentialId: string; label: string | null; createdAt: string; lastUsedAt: string | null }[];
}

interface LockCopy {
  /** Heading on the "not set up yet" screen. */
  enrollTitle: string;
  enrollBody: string;
  /** Heading on the "locked, unlock me" screen. */
  lockedTitle: string;
  lockedBody: string;
}

const RECOVERY_COPY: LockCopy = {
  enrollTitle: "מרחב פרטי",
  enrollBody:
    "המרחב הזה נעול מאחורי טביעת אצבע או זיהוי פנים של המכשיר. שום דבר ממנו לא נטען לדף עד שפותחים — כך שגם מי שמחזיק את המכשיר לא רואה כלום.",
  lockedTitle: "המרחב נעול",
  lockedBody:
    "אמת עם טביעת אצבע או זיהוי פנים כדי להיכנס. המרחב ננעל שוב אוטומטית כשעוברים לאפליקציה אחרת.",
};

interface RecoveryLockGateProps {
  children: (context: { lock: () => Promise<void>; status: LockStatus }) => ReactNode;
  /** Override the lock-screen copy — the WebAuthn credential and the unlock
   *  session are the same device-security context regardless of which
   *  section is asking (recovery space, finances). */
  copy?: LockCopy;
}

/**
 * The door to the recovery space.
 *
 * Renders nothing of its children until the server has confirmed an unlock —
 * and the server sends no recovery data until then either. That combination
 * is what makes this real rather than a blur: there is nothing hidden in the
 * page to reveal, because nothing was ever sent.
 */
export function RecoveryLockGate({ children, copy = RECOVERY_COPY }: RecoveryLockGateProps) {
  const [status, setStatus] = useState<LockStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/recovery/lock");
    if (!res.ok) throw new Error("failed");
    setStatus((await res.json()) as LockStatus);
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setError("לא הצלחנו לבדוק את מצב הנעילה."))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function post(action: string, payload?: Record<string, unknown>) {
    const res = await fetch("/api/recovery/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = (await res.json()) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "failed");
    return data;
  }

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const { options } = (await post("register-options")) as { options: object };
      const response = await startRegistration({ optionsJSON: options as never });
      await post("register-verify", {
        response,
        label: typeof navigator !== "undefined" ? navigator.platform : undefined,
      });
      await refresh();
    } catch (err) {
      // A user who dismisses the system biometric prompt has not hit an
      // error — saying "something went wrong" to a deliberate cancel is both
      // wrong and alarming in this particular feature.
      if (err instanceof Error && /NotAllowed|abort/i.test(err.name + err.message)) {
        setError(null);
      } else {
        setError(
          err instanceof Error && err.message !== "failed"
            ? err.message
            : "המכשיר הזה לא תומך בנעילה ביומטרית, או שההגדרה נכשלה."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      const { options } = (await post("auth-options")) as { options: object };
      const response = await startAuthentication({ optionsJSON: options as never });
      await post("auth-verify", { response });
      await refresh();
    } catch (err) {
      if (err instanceof Error && /NotAllowed|abort/i.test(err.name + err.message)) {
        setError(null);
      } else {
        setError("האימות נכשל. נסה שוב.");
      }
    } finally {
      setBusy(false);
    }
  }

  const lock = useCallback(async () => {
    await post("lock").catch(() => {});
    await refresh().catch(() => {});
  }, [refresh]);

  // Re-lock when the tab goes away. Someone who switches apps and hands over
  // the phone should not come back to an open recovery space.
  useEffect(() => {
    if (!status?.unlocked) return;
    function onHidden() {
      if (document.visibilityState === "hidden") {
        void fetch("/api/recovery/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lock" }),
          keepalive: true,
        });
        setStatus((s) => (s ? { ...s, unlocked: false } : s));
      }
    }
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [status?.unlocked]);

  if (loading) {
    return (
      <GlassCard>
        <p className="flex items-center gap-2 py-4 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          בודק…
        </p>
      </GlassCard>
    );
  }

  if (status?.unlocked) {
    return <>{children({ lock, status })}</>;
  }

  return (
    <GlassCard className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-gold-soft text-gold-ink">
        {status?.enrolled ? <Lock size={24} aria-hidden /> : <ShieldCheck size={24} aria-hidden />}
      </span>

      {status?.enrolled ? (
        <>
          <div>
            <p className="text-base font-medium text-foreground">{copy.lockedTitle}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">{copy.lockedBody}</p>
          </div>
          <button
            onClick={unlock}
            disabled={busy}
            className="focus-ring flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Fingerprint size={15} aria-hidden />
            )}
            פתח
          </button>
        </>
      ) : (
        <>
          <div>
            <p className="text-base font-medium text-foreground">{copy.enrollTitle}</p>
            <p className="mt-1 max-w-md text-sm text-muted">{copy.enrollBody}</p>
          </div>
          <button
            onClick={enroll}
            disabled={busy}
            className="focus-ring flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Fingerprint size={15} aria-hidden />
            )}
            הגדר נעילה
          </button>
          <p className="max-w-sm text-xs text-muted">
            צריך מכשיר עם טביעת אצבע, Face ID או Windows Hello. המפתח נשאר במכשיר עצמו ולא נשלח לשום
            מקום.
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="max-w-sm text-sm text-red-500">
          {error}
        </p>
      )}
    </GlassCard>
  );
}
