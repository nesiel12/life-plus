import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/currentUser";
import { exchangeCodeForTokens } from "@/lib/photos/auth";

export const runtime = "nodejs";

const STATE_COOKIE = "lifeplus.photos.oauth_state";

function back(path: string): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(back("/login"));
  }

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  // Consume the nonce regardless of outcome so it can't be replayed.
  jar.delete(STATE_COOKIE);

  if (!expected || !state || state !== expected) {
    return NextResponse.redirect(back("/areas/family?photos=state_mismatch"));
  }
  if (!code) {
    return NextResponse.redirect(back("/areas/family?photos=denied"));
  }

  try {
    await exchangeCodeForTokens(await getCurrentUserId(), code);
    return NextResponse.redirect(back("/areas/family?photos=connected"));
  } catch {
    return NextResponse.redirect(back("/areas/family?photos=error"));
  }
}
