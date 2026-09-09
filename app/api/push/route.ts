import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/currentUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { isPushConfigured } from "@/lib/webpush/config";
import { pushSubscriptionsRepo } from "@/lib/db/pushSubscriptions";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({
      p256dh: z.string().min(1).max(256),
      auth: z.string().min(1).max(256),
    }),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });

// GET → the VAPID public key the browser needs for pushManager.subscribe(),
// plus whether push is usable on this deployment at all.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    configured: isPushConfigured(),
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? null,
  });
}

// POST → save (or refresh) this browser's subscription.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimitResponse(`push:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, subscribeSchema);
  if (parsed.error) return parsed.error;

  const userId = await getCurrentUserId();
  await pushSubscriptionsRepo.save(userId, {
    endpoint: parsed.data.subscription.endpoint,
    p256dh: parsed.data.subscription.keys.p256dh,
    auth: parsed.data.subscription.keys.auth,
    userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
  });

  return NextResponse.json({ ok: true });
}

// DELETE → drop this browser's subscription (the toggle turned off).
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, unsubscribeSchema);
  if (parsed.error) return parsed.error;

  const userId = await getCurrentUserId();
  await pushSubscriptionsRepo.removeByEndpoint(userId, parsed.data.endpoint);

  return NextResponse.json({ ok: true });
}
