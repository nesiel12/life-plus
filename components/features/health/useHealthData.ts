"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_TARGETS, type HealthTargets } from "@/lib/health/nutrition";
import type { WaterLog } from "@/lib/health/water";

/** The browser's local midnight — "today" is the person's calendar day. */
export function localMidnight(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The user's targets (defaults until they set their own). */
export function useHealthTargets() {
  const [targets, setTargets] = useState<HealthTargets>(DEFAULT_TARGETS);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    fetch("/api/health/targets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.targets) {
          setTargets(data.targets);
          setCustom(Boolean(data.custom));
        }
      })
      .catch(() => undefined);
  }, []);

  const save = useCallback(async (next: HealthTargets) => {
    const previous = targets;
    setTargets(next);
    const response = await fetch("/api/health/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    if (!response?.ok) {
      setTargets(previous);
      return false;
    }
    const data = await response.json();
    setTargets(data.targets);
    setCustom(true);
    return true;
  }, [targets]);

  return { targets, custom, save };
}

/**
 * Today's water log, with optimistic adds.
 *
 * A tap fills the glass immediately; the server write follows. If it fails,
 * the optimistic row is removed and the error surfaces — the glass must never
 * show water that was not recorded.
 */
export function useWater() {
  const [logs, setLogs] = useState<WaterLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/health/water?since=${encodeURIComponent(localMidnight().toISOString())}`, {
        cache: "no-store",
      });
      const data = await response.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async (amountMl: number) => {
    setError(null);
    const temp: WaterLog = { id: `temp-${Date.now()}`, amountMl, loggedAt: new Date().toISOString() };
    setLogs((prev) => [...(prev ?? []), temp]);
    try {
      const response = await fetch("/api/health/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMl }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setLogs((prev) => (prev ?? []).map((log) => (log.id === temp.id ? data.log : log)));
    } catch {
      setLogs((prev) => (prev ?? []).filter((log) => log.id !== temp.id));
      setError("הרישום לא נשמר. נסה שוב.");
    }
  }, []);

  const undo = useCallback(async () => {
    const last = logs?.[logs.length - 1];
    if (!last || last.id.startsWith("temp-")) return;
    setLogs((prev) => (prev ?? []).slice(0, -1));
    const response = await fetch(`/api/health/water?id=${last.id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      setError("הביטול לא נשמר.");
      void load();
    }
  }, [logs, load]);

  return { logs, error, add, undo };
}
