"use client";

import { useCallback, useSyncExternalStore } from "react";

// The investigation trail — where the user has been in the Book ⇄ Rabbi loop.
//
// Two lists with different lifetimes, both per-device conveniences and never
// data the app depends on (so browser storage, wrapped so a blocked or
// private-mode storage degrades to "no trail", not a crash):
//
//   * the TRAIL (sessionStorage): this sitting's path, rendered as a
//     breadcrumb on Book and Rabbi pages — "משנה ברורה ← החפץ חיים ← שמירת
//     הלשון" — so a deep investigation can be retraced;
//   * RECENT (localStorage): the last few pages opened, for the search
//     command center's empty state.

export interface TrailNode {
  type: "book" | "rabbi";
  id: string;
  label: string;
}

const TRAIL_KEY = "torah-trail";
const RECENT_KEY = "torah-recent";
const TRAIL_MAX = 8;
const RECENT_MAX = 6;
const EVENT = "torah-trail-change";

function read(storage: () => Storage, key: string): TrailNode[] {
  try {
    const parsed = JSON.parse(storage().getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (n): n is TrailNode =>
            n && (n.type === "book" || n.type === "rabbi") && typeof n.id === "string" && typeof n.label === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function write(storage: () => Storage, key: string, nodes: TrailNode[]) {
  try {
    storage().setItem(key, JSON.stringify(nodes));
  } catch {
    // Storage full or blocked — the trail is a convenience; drop it.
  }
}

const session = () => window.sessionStorage;
const local = () => window.localStorage;

/**
 * Records a page visit.
 *
 * Revisiting a node already on the trail cuts the trail back to it rather
 * than appending a loop — going Book → Rabbi → Book(same) should read as
 * having returned, not as a three-step path.
 */
export function recordTrailVisit(node: TrailNode) {
  if (typeof window === "undefined") return;

  const trail = read(session, TRAIL_KEY);
  const existing = trail.findIndex((n) => n.type === node.type && n.id === node.id);
  const nextTrail = existing >= 0 ? [...trail.slice(0, existing), node] : [...trail, node].slice(-TRAIL_MAX);
  write(session, TRAIL_KEY, nextTrail);

  const recent = read(local, RECENT_KEY).filter((n) => !(n.type === node.type && n.id === node.id));
  write(local, RECENT_KEY, [node, ...recent].slice(0, RECENT_MAX));

  window.dispatchEvent(new Event(EVENT));
}

// useSyncExternalStore needs a referentially stable snapshot, so each list is
// cached against the raw string it was parsed from.
const cache = new Map<string, { raw: string | null; value: TrailNode[] }>();
const EMPTY: TrailNode[] = [];

function snapshot(storage: () => Storage, key: string): TrailNode[] {
  let raw: string | null;
  try {
    raw = storage().getItem(key);
  } catch {
    return EMPTY;
  }
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value;
  const value = read(storage, key);
  cache.set(key, { raw, value });
  return value;
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useInvestigationTrail(): TrailNode[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(session, TRAIL_KEY),
    () => EMPTY
  );
}

export function useRecentTorahPages(): TrailNode[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(local, RECENT_KEY),
    () => EMPTY
  );
}

export function useClearTrail() {
  return useCallback(() => {
    write(session, TRAIL_KEY, []);
    window.dispatchEvent(new Event(EVENT));
  }, []);
}

export function torahHref(node: Pick<TrailNode, "type" | "id">): string {
  return node.type === "book" ? `/areas/torah/books/${node.id}` : `/areas/torah/rabbis/${node.id}`;
}
