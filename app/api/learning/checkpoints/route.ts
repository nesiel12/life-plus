import { NextResponse } from "next/server";
import { z } from "zod";
import { YoutubeTranscript } from "youtube-transcript";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { learningTopicsRepo } from "@/lib/db/learning";
import { videoCheckpointsRepo } from "@/lib/db/learningInteractive";
import { checkpointWindows, normalizeCheckpoints, parseCheckpointTime, readAnswers, type Checkpoint } from "@/lib/learning/checkpoints";
import { formatTimecode } from "@/lib/torah/lessons/timecode";
import { youtubeVideoId } from "@/lib/learning/youtube";
import { normalizeCaptions, transcriptForPrompt, type TranscriptLine } from "@/lib/torah/lessons/transcript";
import { youtubeVideoDetails } from "@/lib/torah/sources/youtube";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 90;

const checkpointsSchema = z.object({
  checkpoints: z
    .array(
      z.object({
        at: z
          .string()
          .describe("חותמת הזמן בפורמט MM:SS בדיוק כפי שהיא מופיעה בתמליל, מיד אחרי שהרעיון הוסבר. למשל 06:43. לא מספר שניות."),
        question: z.string().describe("שאלת הבנה קצרה בעברית על מה שהוסבר עד הרגע הזה"),
        options: z.array(z.string()).describe("3-4 תשובות אפשריות בעברית, רק אחת נכונה, מסיחים סבירים"),
        correctIndex: z.number().describe("אינדקס התשובה הנכונה (מ-0)"),
        explanation: z.string().describe("משפט אחד בעברית: למה זו התשובה הנכונה, מתוך הסרטון"),
      })
    )
    .describe("3-5 נקודות עצירה, מפוזרות לאורך הסרטון, ברגעים שבהם הוסבר רעיון מרכזי"),
});

/** The client never sees which option is correct until it has answered. */
function publicView(checkpoints: Checkpoint[]) {
  return checkpoints.map((c) => ({ id: c.id, atSeconds: c.atSeconds, question: c.question, options: c.options }));
}

async function fetchCaptions(videoId: string, durationSeconds: number | null): Promise<TranscriptLine[]> {
  for (const lang of ["iw", "he", undefined]) {
    try {
      const segments = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
      // The video's real length settles whether offsets are seconds or
      // milliseconds; without it the package's units are only a guess.
      const lines = normalizeCaptions(segments, durationSeconds);
      if (lines.length > 0) return lines;
    } catch {
      // No captions in this language — try the next.
    }
  }
  return [];
}

function response(row: { video_id: string; checkpoints: Json; answers: Json }) {
  const checkpoints = (Array.isArray(row.checkpoints) ? row.checkpoints : []) as unknown as Checkpoint[];
  const answers = readAnswers(row.answers);
  // An answered checkpoint may show its explanation and correct option.
  const revealed = Object.fromEntries(
    checkpoints.filter((c) => answers[c.id]).map((c) => [c.id, { correctIndex: c.correctIndex, explanation: c.explanation }])
  );
  return { videoId: row.video_id, checkpoints: publicView(checkpoints), answers, revealed };
}

/** GET ?videoId= — the stored checkpoints for a video, if they were built. */
export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const videoId = youtubeVideoId(new URL(request.url).searchParams.get("videoId") ?? "");
  if (!videoId) return NextResponse.json({ error: "סרטון לא תקין." }, { status: 400 });
  const row = await videoCheckpointsRepo.findByVideo(auth.user.id, videoId);
  return NextResponse.json(row ? response(row) : { videoId, checkpoints: null });
}

const buildSchema = z.object({
  videoUrl: z.string().min(5).max(500),
  topicId: z.string().uuid().optional(),
});

/**
 * Builds the interactive checkpoints for a YouTube video from its captions.
 *
 * Built once per (user, video) and stored — rewatching never re-bills the
 * model. Timestamps come from the caption timecodes the model is shown and
 * are then validated and spaced (lib/learning/checkpoints.ts). A video with no
 * captions gets an honest answer rather than questions invented from its title.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "learning-checkpoints", limit: 10, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const parsed = await parseJsonBody(request, buildSchema);
  if (parsed.error) return parsed.error;

  const videoId = youtubeVideoId(parsed.data.videoUrl);
  if (!videoId) return NextResponse.json({ error: "זה לא קישור YouTube תקין." }, { status: 400 });

  const existing = await videoCheckpointsRepo.findByVideo(user.id, videoId);
  if (existing && Array.isArray(existing.checkpoints) && existing.checkpoints.length > 0) {
    return NextResponse.json(response(existing));
  }

  let topicTitle: string | null = null;
  if (parsed.data.topicId) {
    const topic = await learningTopicsRepo.get(user.id, parsed.data.topicId);
    if (!topic) return NextResponse.json({ error: "הנושא לא נמצא." }, { status: 404 });
    topicTitle = topic.title;
  }
  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "אין מפתח AI מחובר, ולכן אי אפשר לבנות נקודות עצירה." }, { status: 503 });
  }

  const details = await youtubeVideoDetails(videoId).catch(() => null);
  const lines = await fetchCaptions(videoId, details?.durationSeconds ?? null);
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "לסרטון הזה אין כתוביות, ולכן אי אפשר לבנות שאלות הבנה מתוכו. אפשר לצפות בו כרגיל." },
      { status: 422 }
    );
  }
  const duration = Math.ceil(lines[lines.length - 1].end);
  const windows = checkpointWindows(duration);

  try {
    const object = await generateStructuredData({
      actor: { kind: "user", userId: user.id },
      schema: checkpointsSchema,
      system: [
        "אתה מורה שבונה שיעור וידאו אינטראקטיבי: נקודות עצירה שבהן הצופה עונה על שאלת הבנה לפני שממשיך.",
        "כל שאלה בודקת הבנה של מה שהוסבר עד אותו רגע — לא זיכרון של פרט שולי, ולא דבר שיוסבר רק אחר כך.",
        "השתמש אך ורק בחותמות הזמן שמופיעות בתמליל. שים כל נקודה מיד אחרי סיום ההסבר הרלוונטי.",
        "כתוב את השאלות, התשובות וההסברים בעברית, גם אם הסרטון בשפה אחרת. אל תערבב אותיות לטיניות בתוך מילים בעברית.",
      ].join("\n"),
      prompt: [
        topicTitle ? `נושא הלימוד: ${topicTitle}` : null,
        `אורך הסרטון: כ-${Math.round(duration / 60)} דקות.`,
        windows.length > 0
          ? `בנה בדיוק ${windows.length} נקודות עצירה, אחת בכל אחד מהטווחים הבאים, ברגע שבו הסתיים הסבר של רעיון בתוך הטווח:\n${windows
              .map((w, i) => `${i + 1}. בין ${formatTimecode(w.fromSeconds)} ל-${formatTimecode(w.toSeconds)}`)
              .join("\n")}`
          : null,
        `התמליל עם חותמות זמן:\n${transcriptForPrompt(lines, 60_000)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      timeoutMs: 70_000,
    });

    const checkpoints = normalizeCheckpoints(
      object.checkpoints.map(({ at, ...rest }) => ({ ...rest, atSeconds: parseCheckpointTime(at) ?? undefined })),
      duration
    );
    if (checkpoints.length === 0) {
      return NextResponse.json({ error: "לא הצלחנו לבנות נקודות עצירה לסרטון הזה." }, { status: 502 });
    }
    const values = {
      checkpoints: checkpoints as unknown as Json,
      answers: {} as Json,
      topic_id: parsed.data.topicId ?? null,
    };
    const row = existing
      ? await videoCheckpointsRepo.update(user.id, existing.id, values)
      : await videoCheckpointsRepo.insert({ user_id: user.id, video_id: videoId, ...values });
    return NextResponse.json(response(row), { status: 201 });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("[learning] checkpoints failed:", err);
    return NextResponse.json({ error: "בניית נקודות העצירה נכשלה. נסה שוב." }, { status: 502 });
  }
}

const answerSchema = z.object({
  videoId: z.string().min(5).max(40),
  checkpointId: z.string().min(1).max(40),
  choice: z.number().int().min(0).max(3),
});

/**
 * Records an answer. Correctness is decided HERE against the stored answer
 * key — the client never had it — and the explanation comes back with it.
 */
export async function PATCH(request: Request) {
  const auth = await requireSessionUser({ key: "learning-checkpoint-answer", limit: 60, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const parsed = await parseJsonBody(request, answerSchema);
  if (parsed.error) return parsed.error;

  const row = await videoCheckpointsRepo.findByVideo(auth.user.id, parsed.data.videoId);
  if (!row) return NextResponse.json({ error: "הסרטון לא נמצא." }, { status: 404 });
  const checkpoints = (Array.isArray(row.checkpoints) ? row.checkpoints : []) as unknown as Checkpoint[];
  const checkpoint = checkpoints.find((c) => c.id === parsed.data.checkpointId);
  if (!checkpoint || parsed.data.choice >= checkpoint.options.length) {
    return NextResponse.json({ error: "השאלה לא נמצאה." }, { status: 404 });
  }

  const answers = readAnswers(row.answers);
  const correct = parsed.data.choice === checkpoint.correctIndex;
  answers[checkpoint.id] = { choice: parsed.data.choice, correct, answeredAt: new Date().toISOString() };
  const updated = await videoCheckpointsRepo.update(auth.user.id, row.id, { answers: answers as unknown as Json });
  return NextResponse.json({ correct, correctIndex: checkpoint.correctIndex, explanation: checkpoint.explanation, ...response(updated) });
}
