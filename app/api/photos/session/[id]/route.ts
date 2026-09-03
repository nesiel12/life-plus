import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/currentUser";
import { getPhotosAccessToken, PhotosNotConnectedError } from "@/lib/photos/auth";
import { getPickingSession } from "@/lib/photos/pickerClient";
import { pickerSessionsRepo } from "@/lib/db/googlePhotos";

export const runtime = "nodejs";

// Polling is the ONLY completion mechanism Google offers — there is no webhook
// and no callback. The client polls this, which proxies sessions.get so the
// browser never holds a Google token.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const userId = await getCurrentUserId();
    // Ownership check before touching Google: an id from another user must not
    // be pollable just because it is a valid session id.
    const owned = await pickerSessionsRepo.get(userId, id);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const accessToken = await getPhotosAccessToken(userId);
    const picking = await getPickingSession(accessToken, id);

    if (picking.mediaItemsSet) {
      await pickerSessionsRepo.markItemsSet(userId, id);
    }

    return NextResponse.json({
      mediaItemsSet: Boolean(picking.mediaItemsSet),
      // Re-issued on every poll and absent once picking completes, so the
      // client must read it per-response rather than caching it at creation.
      pollingConfig: picking.pollingConfig ?? null,
      expireTime: picking.expireTime ?? null,
    });
  } catch (err) {
    if (err instanceof PhotosNotConnectedError) {
      return NextResponse.json({ error: "Google Photos לא מחובר.", code: "not_connected" }, { status: 409 });
    }
    return NextResponse.json({ error: "בדיקת הבורר נכשלה." }, { status: 502 });
  }
}
