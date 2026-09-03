import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/currentUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { getPhotosAccessToken, PhotosNotConnectedError } from "@/lib/photos/auth";
import {
  deletePickingSession,
  downloadPickedMedia,
  listPickedMediaItems,
} from "@/lib/photos/pickerClient";
import { photoMemoriesRepo, pickerSessionsRepo } from "@/lib/db/googlePhotos";
import { peopleRepo } from "@/lib/db/people";
import { downscaleImage, AVATAR_MAX_EDGE, CARD_MAX_EDGE } from "@/lib/photos/downscale";

// Ingest: the step where the storage decision actually happens.
//
// The picked media is downloaded and a downscaled derivative is stored, because
// storing only an id yields a permanently broken image — Google's baseUrls
// expire in ~60 minutes and there is no lookup-by-id. Explicitly approved by
// the account owner; rationale in docs/GOOGLE_PHOTOS_CONSTRAINTS.md.
//
// This must happen while the picking session is still alive: session expiry
// revokes access to the picked media itself, not just to the session record.

export const runtime = "nodejs";
export const maxDuration = 120;

const RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

const bodySchema = z.object({ sessionId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`photos-ingest:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, bodySchema);
  if (parsed.error) return parsed.error;

  try {
    const userId = await getCurrentUserId();
    const owned = await pickerSessionsRepo.get(userId, parsed.data.sessionId);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const accessToken = await getPhotosAccessToken(userId);
    const items = await listPickedMediaItems(accessToken, parsed.data.sessionId);
    const photos = items.filter((item) => item.type === "PHOTO");

    if (photos.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, note: "לא נבחרו תמונות." });
    }

    const isAvatar = owned.purpose === "avatar";
    const maxEdge = isAvatar ? AVATAR_MAX_EDGE : CARD_MAX_EDGE;

    let imported = 0;
    let skipped = 0;

    for (const item of photos) {
      try {
        const raw = await downloadPickedMedia(accessToken, item, maxEdge * 2);
        const image = await downscaleImage(raw, maxEdge);

        if (isAvatar && owned.target_person_id) {
          // Avatars reuse the existing people.avatar_url data: URL column
          // rather than a second storage mechanism for one small image.
          await peopleRepo.update(userId, owned.target_person_id, {
            avatar_url: `data:${image.mimeType};base64,${image.data.toString("base64")}`,
          });
        } else {
          await photoMemoriesRepo.insert({
            userId,
            takenAt: item.createTime,
            googleMediaId: item.id,
            source: "picker",
            imageData: image.data,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            byteSize: image.byteSize,
          });
        }
        imported += 1;
      } catch {
        // One bad photo (unsupported codec, oversized after retry, transient
        // download failure) must not abort a whole import batch.
        skipped += 1;
      }
    }

    // Recommended by Google, and it frees a slot against the undocumented
    // concurrent-session cap. Best-effort: failing here doesn't undo the import.
    await deletePickingSession(accessToken, parsed.data.sessionId).catch(() => {});
    await pickerSessionsRepo.remove(userId, parsed.data.sessionId).catch(() => {});

    return NextResponse.json({ imported, skipped });
  } catch (err) {
    if (err instanceof PhotosNotConnectedError) {
      return NextResponse.json({ error: "Google Photos לא מחובר.", code: "not_connected" }, { status: 409 });
    }
    return NextResponse.json({ error: "ייבוא התמונות נכשל." }, { status: 502 });
  }
}
