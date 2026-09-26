"use client";

import { useSyncExternalStore } from "react";

// Chrome/Edge/Android fire `beforeinstallprompt` once, early — often before
// any component that wants it has mounted. Capturing it at module load and
// exposing it as an external store means a button mounted later (or on
// another page) still gets the prompt.

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState =
  | { kind: "installed" }
  | { kind: "prompt"; prompt: () => Promise<boolean> }
  | { kind: "ios" }
  | { kind: "unavailable" };

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress the browser's own mini-infobar — the app offers its own button.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/** iPhone/iPad (iPadOS reports itself as a Mac, so touch points tell them apart). */
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // A captured prompt can only be shown once.
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

// Cached so useSyncExternalStore sees a stable snapshot between changes.
let snapshot: InstallState = { kind: "unavailable" };
let snapshotKey = "";

function getSnapshot(): InstallState {
  const kind: InstallState["kind"] =
    installed || isStandalone()
      ? "installed"
      : deferred
        ? "prompt"
        : isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
          ? "ios"
          : "unavailable";
  const key = `${kind}:${deferred ? 1 : 0}`;
  if (key !== snapshotKey) {
    snapshotKey = key;
    snapshot = kind === "prompt" ? { kind, prompt: promptInstall } : { kind };
  }
  return snapshot;
}

const serverSnapshot: InstallState = { kind: "unavailable" };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
