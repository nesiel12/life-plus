import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { transcribeAudio, isTranscriptionConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// Audio-transcription leg of the Torah Space AI Summarizer's "input
// triangle" (text / YouTube / audio file). Goes through the same shared
// Whisper wiring app/api/torah/extract's audio branch already uses
// (lib/ai's transcribeAudio, whisper-1) rather than a second, parallel
// OpenAI client — one place that knows how Atlas talks to Whisper. Returns
// transcript text only; the frontend feeds it straight into
// /api/ai/summarize-shiur, same as the YouTube leg does.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 transcriptions / 5 min

const MAX_FILE_BYTES = 25 * 1024 * 1024; // Whisper's own limit; same cap app/api/torah/extract uses

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`transcribe-audio:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  // Resolved from the session, never from the request body.
  const actor = await currentUserActor();

  if (!isTranscriptionConfigured()) {
    return NextResponse.json(
      { error: "תמלול אודיו דורש מפתח OpenAI מחובר (Whisper). פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  let file: FormDataEntryValue | null;
  try {
    const formData = await request.formData();
    file = formData.get("file");
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!file.type.startsWith("audio/")) {
    return NextResponse.json({ error: "יש להעלות קובץ אודיו (mp3, m4a, wav וכו')." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מדי (מקסימום 25MB)." }, { status: 413 });
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const { text } = await transcribeAudio(buffer, actor, file.type);
    if (!text.trim()) {
      return NextResponse.json({ error: "לא זיהינו דיבור בהקלטה. נסה להקליט שוב, קרוב יותר למיקרופון." }, { status: 422 });
    }
    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    // The real reason goes to the server log; the user gets a clean line.
    console.error("[transcribe-audio] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "התמלול נכשל. נסה שוב." }, { status: 500 });
  }
}
