import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import type { MomentCategory, SuggestedAction } from "@/types";

export const runtime = "nodejs";

const lifeAreaSchema = z.object({
  key: z.enum(["faith", "family", "knowledge", "health", "career"]),
  label: z.string(),
  score: z.number().min(0).max(100),
  colorVar: z.string(),
  lastTouched: z.string().optional(),
});

const suggestionsRequestSchema = z.object({
  lifeAreas: z.array(lifeAreaSchema).max(20).default([]),
});

const ACTION_BY_CATEGORY: Record<MomentCategory, string> = {
  faith: "זמן לימוד תורה",
  family: "זמן איכות עם המשפחה",
  knowledge: "זמן לפרויקט אישי",
  health: "אימון או הליכה",
  career: "התקדמות בפרויקט מקצועי",
  general: "זמן פנוי",
};

const MIN_SLOT_MINUTES = 30;
const MAX_SUGGESTIONS = 3;

interface FreeBusyResponse {
  calendars?: {
    primary?: {
      busy?: { start: string; end: string }[];
    };
  };
}

function computeFreeSlots(busy: { start: string; end: string }[], from: Date, to: Date) {
  const sorted = [...busy]
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: { start: Date; end: Date }[] = [];
  let cursor = from;

  for (const period of sorted) {
    if (period.start.getTime() > cursor.getTime()) {
      slots.push({ start: cursor, end: period.start });
    }
    if (period.end.getTime() > cursor.getTime()) {
      cursor = period.end;
    }
  }
  if (cursor.getTime() < to.getTime()) {
    slots.push({ start: cursor, end: to });
  }

  return slots.filter(
    (s) => (s.end.getTime() - s.start.getTime()) / 60_000 >= MIN_SLOT_MINUTES
  );
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = session.accessToken;
  if (!accessToken) {
    return NextResponse.json({ connected: false, suggestions: [] });
  }

  const parsed = await parseJsonBody(request, suggestionsRequestSchema);
  if (parsed.error) return parsed.error;
  const { lifeAreas } = parsed.data;

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(22, 0, 0, 0);

  if (endOfDay.getTime() <= now.getTime()) {
    return NextResponse.json({ connected: true, suggestions: [] });
  }

  try {
    const freeBusyRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: endOfDay.toISOString(),
        items: [{ id: "primary" }],
      }),
    });

    if (!freeBusyRes.ok) {
      return NextResponse.json({ connected: true, suggestions: [] });
    }

    const data = (await freeBusyRes.json()) as FreeBusyResponse;
    const busy = data.calendars?.primary?.busy ?? [];
    const freeSlots = computeFreeSlots(busy, now, endOfDay);

    const weakestAreas = [...lifeAreas].sort((a, b) => a.score - b.score).slice(0, MAX_SUGGESTIONS);

    const suggestions: SuggestedAction[] = freeSlots.slice(0, weakestAreas.length).map((slot, i) => {
      const area = weakestAreas[i];
      return {
        id: Math.random().toString(36).slice(2, 10),
        title: ACTION_BY_CATEGORY[area.key],
        category: area.key,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        rationale: `זה התחום עם המדד הכי נמוך כרגע (${area.score}%), ומצאתי לו חלון פנוי ביומן.`,
      };
    });

    return NextResponse.json({ connected: true, suggestions });
  } catch {
    return NextResponse.json({ connected: true, suggestions: [] });
  }
}
