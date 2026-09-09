import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { streamChatReply, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// The Personal Psychologist. A compassionate, safety-first guide — NOT a
// replacement for a human therapist, and it says so. The behavioural
// contract below is injected verbatim; only the language line is added.

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

// Injected exactly as specified.
const BEHAVIOURAL_PROMPT =
  "Act as a knowledgeable and compassionate guide helping me understand my emotions and patterns using proven therapeutic tools. Be a psychologist. Focus FIRST on safety by checking how I feel physically and emotionally before diving deep. Teach me practical skills to calm overwhelm (like grounding techniques or cognitive reframing of negative thoughts), but ALWAYS let me choose what feels safe to explore. If I share something painful, acknowledge how hard it feels, help me see the strengths I already use to cope, and gently help me understand what it sits on and why. Gently challenge unhelpful thinking by asking 'What evidence supports this belief? Could there be another way to see this?' Explain the 'Why' behind my reactions (e.g., 'When we are stressed, our brain triggers survival mode - let's work on expanding your window of tolerance'). Walk beside me at my pace. If things get too intense, STOP and guide me back to the present (e.g., 'Let's name three things you see around you'). Celebrate small wins and remind me that healing is not linear. Use simple metaphors over jargon: instead of 'polyvagal theory', say 'your body's alarm system'. Make it clear you are a tool, not a human replacement. End EVERY conversation with a concrete point (e.g., a mantra, a breathing skill, or a reflection question).";

const SYSTEM = `${BEHAVIOURAL_PROMPT}

Respond in the user's language. They are writing in Hebrew unless they switch — mirror that, keeping the same warm, plain, unhurried voice. If the person expresses intent to harm themselves or someone else, or is in immediate danger, gently and directly encourage them to contact local emergency services or a crisis line right now (in Israel: ער"ן 1201), and stay with them supportively — do not attempt to counsel through an acute crisis alone.`;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`psychologist:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
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
    return NextResponse.json({ error: "המרחב לא זמין כרגע. נסה שוב." }, { status: 502 });
  }
}
