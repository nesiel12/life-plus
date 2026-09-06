import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/currentUser";
import { photoMemoriesRepo, googlePhotosCredentialsRepo } from "@/lib/db/googlePhotos";
import { momentsRepo } from "@/lib/db/moments";
import { peopleRepo } from "@/lib/db/people";
import { findAnniversaries } from "@/lib/memories/anniversary";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { AiQuotaExceededError } from "@/lib/ai/service";
import type { AiActor } from "@/lib/ai/quota";
import { createFanOutBudget } from "@/lib/ai/fanOut";
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

/**
 * How many captions one request may generate.
 *
 * Captions are cached after the first pass, so this only bites on a corpus
 * the user has never viewed — but that first pass was previously the one AI
 * path in the app with no rate limiter in front of it.
 */
const MAX_CAPTIONS_PER_REQUEST = 3;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getCurrentUserId();
  // Same server-resolved identity the rest of the route is scoped to.
  const actor: AiActor = { kind: "user", userId };
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

  // An explicit ceiling on model calls, separate from `maxResults` above.
  // That number bounds what is *displayed*; this bounds what is *spent*, and
  // tying cost to a display constant means someone widening the card later
  // silently widens the bill. Captions beyond it are simply absent.
  const captionBudget = createFanOutBudget(MAX_CAPTIONS_PER_REQUEST);
  let quotaExhausted = false;

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
      if (!captionBudget.take()) return { ...base, caption: null };

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
          actor,
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
      } catch (err) {
        // A caption failure must not cost the user the photo itself — the
        // photos are the product here and the captions are a garnish, so
        // this degrades rather than 429-ing the whole card.
        //
        // Quota exhaustion is still recorded, because silently returning
        // uncaptioned photos forever is the one failure the user cannot
        // diagnose. Nothing was billed: chargeQuota throws before the model
        // is called.
        if (err instanceof AiQuotaExceededError) quotaExhausted = true;
        return { ...base, caption: null };
      }
    })
  );

  // Reported, not thrown: the caller gets its photos either way and can say
  // why the captions are missing.
  return NextResponse.json({ connected, corpusSize: corpus.length, memories, quotaExhausted });
}
