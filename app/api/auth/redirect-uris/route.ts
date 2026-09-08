import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { googleRedirectUris } from "@/lib/appUrl";

// The exact Google OAuth redirect URIs this deployment sends. Signed-in only
// (it reveals the deployment origin, which is not secret, but there's no
// reason to expose it anonymously). Used by the Settings "חיבורי Google"
// card and handy for a quick check with curl.
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ...googleRedirectUris(),
    nextAuthUrl: process.env.NEXTAUTH_URL ?? null,
  });
}
