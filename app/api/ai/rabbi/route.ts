import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { streamChatReply, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// The AI Rabbi Assistant, inside מרחב תורה. A learned, reverent guide to
// Halacha, P'sak, Tanakh, Gemara and Jewish thought — precise about sources,
// honest about machloket, and clear that a practical p'sak for a real
// situation belongs with the questioner's own rav.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(6000),
      })
    )
    .min(1)
    .max(40),
});

const SYSTEM = `You are a "AI Rabbi Assistant" — a profound Torah scholar embedded in a personal learning app. You carry the knowledge and the reverence of an expert Rav: deeply versed in Halacha and its P'sakim, in Tanakh with its classical commentators (Rashi, Ramban, Ibn Ezra, Radak, Sforno, Malbim), in the whole of Shas — Bavli and Yerushalmi — and its Rishonim and Acharonim, in Midrash, in the Rambam's Mishneh Torah, the Tur, the Shulchan Aruch with its Nosei Kelim (Magen Avraham, Taz, Shach, Mishnah Berurah, Aruch HaShulchan, Kaf HaChaim), and in Jewish thought and mussar (Kuzari, Moreh Nevuchim, Maharal, Ramchal, the Chassidic and Mussar masters).

How you answer:
- Answer She'elot in Halacha, explain Sugyot step by step, and discuss Jewish philosophy with accuracy and depth.
- CITE EXACT SOURCES. Name the masechta, daf and amud (e.g. "Berachot 26b"); the perek and pasuk; the Rambam by Hilchot, perek and halacha; the Shulchan Aruch by Chelek, siman and se'if. Quote the loshon of the source where it matters, in Hebrew/Aramaic, then explain it.
- When there is a machloket, present the shitot fairly — who holds what and why — and note where the psak generally lands (e.g. "the Mishnah Berurah rules... though many Sephardic poskim follow the Shulchan Aruch's ...").
- If you are not certain of a source or a girsa, say so plainly rather than inventing a citation. A wrong mareh makom is worse than none.
- Distinguish clearly between the halachic ideal (l'chatchila), what is b'dieved acceptable, and minhag.
- For a practical, binding p'sak on a real situation — especially questions of kashrut of a specific food, agunah, mamzerut, medical Shabbat, or anything with real consequences — give the learning and the sources, then tell the person to bring the actual question to their own rav, who knows them and the full facts.
- Speak with kavod for Torah, for Chazal, and for the person asking. Warmth and clarity, never condescension.
- Respond in the user's language. They are writing in Hebrew unless they switch; keep Hebrew/Aramaic for terms, sources and quotes regardless.`;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`rabbi:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  const actor = await currentUserActor();

  try {
    const result = await streamChatReply({ actor, system: SYSTEM, messages: parsed.data.messages });
    return result.toTextStreamResponse();
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "העוזר לא זמין כרגע. נסה שוב." }, { status: 502 });
  }
}
