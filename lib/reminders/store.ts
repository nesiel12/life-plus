"use client";

import { useSyncExternalStore } from "react";

// A tiny device-local reminders + alarm store.
//
// Alarms are inherently per-device — a beep or a browser notification can
// only fire on a screen that is actually open — so this lives in
// localStorage rather than the DB, and is shared between the floating alarm
// panel and the always-mounted runner through a module-level subscription
// (the same shape useSyncExternalStore wants) rather than React context, so
// a page that renders neither still keeps the list warm.

export interface Reminder {
  id: string;
  /** What to show when it fires. */
  label: string;
  /** Epoch milliseconds the reminder is due. */
  at: number;
  /** Play a sound when it fires (in addition to the in-app banner). */
  sound: boolean;
  /** Set once it has fired, so a reload does not re-trigger a past alarm. */
  firedAt: number | null;
}

const STORAGE_KEY = "lifeplus.reminders.v1";
// A reminder more than this far past its time is treated as already missed
// on load (device asleep, tab closed) — shown as missed, never rung.
const STALE_MS = 60 * 60 * 1000;

let reminders: Reminder[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function load(): Reminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is Reminder =>
        !!r &&
        typeof r.id === "string" &&
        typeof r.label === "string" &&
        typeof r.at === "number" &&
        typeof r.sound === "boolean"
    );
  } catch {
    return [];
  }
}

function ensureLoaded() {
  if (loaded) return;
  reminders = load();
  loaded = true;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    /* quota / private mode — the in-memory list still works for this session */
  }
}

function emit() {
  persist();
  for (const l of listeners) l();
}

// Cross-tab sync: another tab writing the key updates this one's view.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    reminders = load();
    for (const l of listeners) l();
  });
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Reminder[] {
  ensureLoaded();
  return reminders;
}

function getServerSnapshot(): Reminder[] {
  return [];
}

export function useReminders(): Reminder[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function addReminder(input: { label: string; at: number; sound: boolean }): Reminder {
  ensureLoaded();
  const reminder: Reminder = {
    id: crypto.randomUUID(),
    label: input.label.trim() || "תזכורת",
    at: input.at,
    sound: input.sound,
    firedAt: null,
  };
  reminders = [...reminders, reminder].sort((a, b) => a.at - b.at);
  emit();
  return reminder;
}

export function removeReminder(id: string) {
  ensureLoaded();
  reminders = reminders.filter((r) => r.id !== id);
  emit();
}

export function markFired(id: string) {
  ensureLoaded();
  reminders = reminders.map((r) => (r.id === id ? { ...r, firedAt: Date.now() } : r));
  emit();
}

export function clearFired() {
  ensureLoaded();
  reminders = reminders.filter((r) => r.firedAt === null);
  emit();
}

/**
 * Reminders that are due right now and have not fired yet — the runner rings
 * these. A reminder whose time slipped by more than STALE_MS while nothing
 * was watching is marked fired silently (see `staleDue`) instead.
 */
export function splitDue(now: number): { ring: Reminder[]; stale: Reminder[] } {
  ensureLoaded();
  const ring: Reminder[] = [];
  const stale: Reminder[] = [];
  for (const r of reminders) {
    if (r.firedAt !== null || r.at > now) continue;
    if (now - r.at > STALE_MS) stale.push(r);
    else ring.push(r);
  }
  return { ring, stale };
}
