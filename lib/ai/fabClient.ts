import { readAiError } from "@/lib/api/aiClient";
import type { FabRouteResponse } from "@/lib/ai/fabIntents";
import { FabRequestError } from "@/lib/ai/quickLog";

// The browser's calls for the FAB. Thin on purpose: every decision lives in
// lib/ai/quickLog.ts, where it can be tested without a network.

export async function postFab(text: string): Promise<FabRouteResponse> {
  const res = await fetch("/api/fab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    // Both a quota stop and the burst limiter arrive as 429; readAiError keys
    // on the machine-readable code, so each keeps its own server message.
    const info = await readAiError(res, "Quick log request failed");
    if (res.status === 429) throw new FabRequestError(info.message, info.quotaExceeded);
    throw new Error(info.message);
  }
  return res.json();
}

// Water has no store slice — the tracker keeps its own state
// (components/features/health/useHealthData.ts) — so the FAB talks to the same
// route the tracker does. The tracker reloads from it on mount, so a log made
// here shows up the next time the Health page opens.
export async function postWater(amountMl: number): Promise<{ id: string }> {
  const res = await fetch("/api/health/water", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountMl }),
  });
  if (!res.ok) throw new Error("Water log failed");
  const data: { log: { id: string } } = await res.json();
  return { id: data.log.id };
}

export async function deleteWater(id: string): Promise<void> {
  const res = await fetch(`/api/health/water?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Water undo failed");
}
