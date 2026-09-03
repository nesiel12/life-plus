import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/currentUser";
import { photoMemoriesRepo, googlePhotosCredentialsRepo } from "@/lib/db/googlePhotos";
import { momentsRepo } from "@/lib/db/moments";
import { peopleRepo } from "@/lib/db/people";
import { findAnniversaries } from "@/lib/memories/anniversary";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import {
  MEMORIES_AGENT_SYSTEM,
  buildMemoryPrompt,
  memoryCaptionSchema,
} from "@/lib/ai/agents/memoriesAgent";

// Today's Memory Cards. Matching runs over Atlas's own corpus — Google no
// longer permits scanning the user's library by date, so "a year ago today"
// necessarily means "a year ago today, among the photos you gave us".
// See docs/GOOGLE_PHOTOS_CONSTRAINTS.md.

export const runtime = "nodejs";
export const maxDuration = 45;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getCurrentUserId();
  const [corpus, credentials] = await Promise.all([
    photoMemoriesRepo.listMeta(userId),
    googlePhotosCredentialsRepo.get(userId),
  ]);

  const connected = Boolean(credentials);

  if (corpus.length === 0) {
    // An honest empty state: distinguishes "nothing imported yet" from
    // "imported, but nothing matches today", which read very differently.
    return NextResponse.json({ connected, corpusSize: 0, memories: [] });
  }

  // A tolerance window because an exact same-day hit is rare for a small
  // corpus, and showing nothing most days reads as broken rather than empty.
  const matches = findAnniversaries(
    corpus.map((photo) => ({ ...photo, creationTime: photo.takenAt })),
    new Date(),
    { toleranceDays: 3, maxResults: 3 }
  );

  if (matches.length === 0) {
    return NextResponse.json({ connected, corpusSize: corpus.length, memories: [] });
  }

  // Context for captions, gathered once for the whole batch.
  const [moments, people] = await Promise.all([
    momentsRepo.list(userId).catch(() => []),
    peopleRepo.list(userId).catch(() => []),
  ]);

  const memories = await Promise.all(
    matches.map(async (match) => {
      const photo = match.item;
      const base = {
        id: photo.id,
        takenAt: photo.takenAt,
        yearsAgo: match.yearsAgo,
        width: photo.width,
        height: photo.height,
        imageUrl: `/api/photos/image/${photo.id}`,
      };

      // Cached caption wins: a card must not re-bill an LLM call per render.
      if (photo.caption) return { ...base, caption: photo.caption };
      if (!isProviderConfigured()) return { ...base, caption: null };

      const taken = new Date(photo.takenAt);
      const sameDayMoments = moments
        .filter((m) => {
          // DB column is occurred_at; `timestamp` is the mapped domain name.
          const t = new Date(m.occurred_at);
          return t.getMonth() === taken.getMonth() && t.getDate() === taken.getDate();
        })
        .slice(0, 3)
        .map((m) => m.title);

      try {
        const generated = await generateStructuredData({
          schema: memoryCaptionSchema,
          system: MEMORIES_AGENT_SYSTEM,
          prompt: buildMemoryPrompt({
            yearsAgo: match.yearsAgo,
            dateLabel: taken.toLocaleDateString("he-IL", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            people: people.slice(0, 5).map((p) => p.hebrew_name ?? p.name),
            moments: sameDayMoments,
          }),
        });
        await photoMemoriesRepo.setCaption(userId, photo.id, generated.caption);
        return { ...base, caption: generated.caption };
      } catch {
        // A caption failure must not cost the user the photo itself.
        return { ...base, caption: null };
      }
    })
  );

  return NextResponse.json({ connected, corpusSize: corpus.length, memories });
}
