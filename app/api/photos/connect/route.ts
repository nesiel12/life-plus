import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { buildConsentUrl } from "@/lib/photos/auth";

// Starts the Google Photos incremental-auth flow. Separate from sign-in on
// purpose — see lib/photos/auth.ts.
export const runtime = "nodejs";

const STATE_COOKIE = "lifeplus.photos.oauth_state";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CSRF: the callback must prove it is answering the request we started.
  const state = randomBytes(32).toString("hex");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildConsentUrl(state));
}
