import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/currentUser";
import { photoMemoriesRepo } from "@/lib/db/googlePhotos";

export const runtime = "nodejs";

// Streams a stored derivative. Bytes live in bytea and are served here rather
// than embedded in JSON, so list endpoints stay small.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const userId = await getCurrentUserId();
  // Scoped by user_id, so one user's id can never fetch another's image.
  const image = await photoMemoriesRepo.getImage(userId, id);
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.data.byteLength),
      // Private: this is one user's personal photo, so it must never land in a
      // shared/CDN cache. Immutable because a row's bytes never change in place.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
