"use client";

import { useCallback, useEffect, useState } from "react";

// Client side of Web Push: permission + a pushManager subscription, synced to
// the server so the Daily Backbone alerts can reach the OS notification tray.
//
// State machine, from the component's point of view:
//   unsupported  — no service worker / PushManager on this browser
//   unconfigured — server has no VAPID keys, nothing to subscribe to
//   denied       — the OS permission prompt was declined (only the user can undo)
//   off          — supported & allowed, but not subscribed
//   on           — subscribed; a row exists server-side

export type PushState = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

interface UsePushResult {
  state: PushState;
  busy: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const supported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export function usePushNotifications(): UsePushResult {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    if (!supported()) {
      setState("unsupported");
      return;
    }
    try {
      const meta = await fetch("/api/push").then((r) => (r.ok ? r.json() : null));
      if (!meta?.configured || !meta.publicKey) {
        setState("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    void sync();
  }, [sync]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const meta = await fetch("/api/push").then((r) => r.json());
      if (!meta?.publicKey) throw new Error("push לא מוגדר בשרת.");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(meta.publicKey),
        }));

      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("שמירת המנוי נכשלה.");
      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו להפעיל התראות.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
    } catch {
      setError("לא הצלחנו לכבות את ההתראות.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable };
}
