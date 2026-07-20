import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 requests / 5 min

const createEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
});

interface GoogleEventResponse {
  id?: string;
  htmlLink?: string;
  error?: { message?: string };
}

// Writes an "accepted" schedule suggestion into the user's real Google
// Calendar. Previously "accept" only appended to local state — see
// docs/BACKLOG.md — this is the actual write-back.
export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-events:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 409 });
  }

  const parsed = await parseJsonBody(request, createEventSchema);
  if (parsed.error) return parsed.error;
  const { title, start, end } = parsed.data;

  if (new Date(end).getTime() <= new Date(start).getTime()) {
    return NextResponse.json({ error: "End must be after start." }, { status: 400 });
  }

  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: title,
        start: { dateTime: start },
        end: { dateTime: end },
      }),
    });

    const data = (await res.json()) as GoogleEventResponse;

    if (!res.ok || !data.id) {
      return NextResponse.json(
        { error: data.error?.message ?? "Google Calendar rejected the event." },
        { status: 502 }
      );
    }

    return NextResponse.json({ id: data.id, htmlLink: data.htmlLink });
  } catch {
    return NextResponse.json({ error: "Could not reach Google Calendar." }, { status: 502 });
  }
}
