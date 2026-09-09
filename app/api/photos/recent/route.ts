import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/currentUser";
import { photoMemoriesRepo, googlePhotosCredentialsRepo } from "@/lib/db/googlePhotos";

// The most recent photos the user has given the app — for the dashboard
// Photos widget. Metadata only; each image is streamed by /api/photos/image.
// Distinct from /api/photos/memories, which filters to "a year ago today".
export const runtime = "nodejs";

export interface RecentPhoto {
  id: string;
  takenAt: string;
  width: number;
  height: number;
  caption: string | null;
  imageUrl: string;
}

export interface RecentPhotosResponse {
  connected: boolean;
  corpusSize: number;
  photos: RecentPhoto[];
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getCurrentUserId();
  const limitParam = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 24) : 9;

  const [creds, meta] = await Promise.all([
    googlePhotosCredentialsRepo.get(userId).catch(() => null),
    photoMemoriesRepo.listMeta(userId, 500).catch(() => []),
  ]);

  const payload: RecentPhotosResponse = {
    connected: Boolean(creds),
    corpusSize: meta.length,
    photos: meta.slice(0, limit).map((m) => ({
      id: m.id,
      takenAt: m.takenAt,
      width: m.width,
      height: m.height,
      caption: m.caption,
      imageUrl: `/api/photos/image/${m.id}`,
    })),
  };
  return NextResponse.json(payload);
}
