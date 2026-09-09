import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/currentUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { getPhotosAccessToken, PhotosNotConnectedError } from "@/lib/photos/auth";
import { createPickingSession, PickerApiError } from "@/lib/photos/pickerClient";
import { pickerSessionsRepo } from "@/lib/db/googlePhotos";

export const runtime = "nodejs";

// Picker sessions count against an undocumented per-project cap, so this is
// rate-limited more tightly than a typical read route.
const RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

const bodySchema = z.object({
  purpose: z.enum(["memories", "avatar"]),
  personId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`photos-session:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, bodySchema);
  if (parsed.error) return parsed.error;

  try {
    const userId = await getCurrentUserId();
    const accessToken = await getPhotosAccessToken(userId);

    // One photo for an avatar; a generous batch for building the corpus.
    const picking = await createPickingSession(accessToken, {
      maxItemCount: parsed.data.purpose === "avatar" ? 1 : 200,
    });

    await pickerSessionsRepo.create({
      id: picking.id,
      userId,
      purpose: parsed.data.purpose,
      targetPersonId: parsed.data.personId ?? null,
      pickerUri: picking.pickerUri,
      expireTime: picking.expireTime ?? null,
    });

    return NextResponse.json({
      sessionId: picking.id,
      // /autoclose makes the Google tab close itself once picking finishes.
      pickerUri: `${picking.pickerUri}/autoclose`,
      pollingConfig: picking.pollingConfig ?? null,
    });
  } catch (err) {
    if (err instanceof PhotosNotConnectedError) {
      return NextResponse.json({ error: "Google Photos לא מחובר.", code: "not_connected" }, { status: 409 });
    }
    if (err instanceof PickerApiError) {
      // 403 here is almost always one of: the Photos Picker API not enabled
      // on the project, or a token that predates the picker scope. Both are
      // fixed by an admin/re-consent, not a retry — say so, and keep Google's
      // own message for the details.
      console.error("[photos/session] Picker API error:", err.status, err.message);
      if (err.status === 401 || err.status === 403) {
        return NextResponse.json(
          {
            error:
              "Google דחה את הבקשה לבורר התמונות. נסה לחבר מחדש את Google Photos; אם זה נמשך — צריך להפעיל את Photos Picker API בקונסולת Google Cloud.",
            code: "picker_denied",
            detail: err.message,
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: `בורר התמונות החזיר שגיאה: ${err.message}`, code: "picker_error", detail: err.message },
        { status: 502 }
      );
    }
    console.error("[photos/session] unexpected error:", err);
    return NextResponse.json({ error: "לא הצלחנו לפתוח בורר תמונות." }, { status: 502 });
  }
}
