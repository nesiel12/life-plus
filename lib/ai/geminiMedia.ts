import "server-only";

// Gemini, for media: uploading audio to the Files API and transcribing one
// time window of audio or YouTube video with timestamps.
//
// A direct REST integration rather than the AI SDK, for two capabilities the
// SDK's file part does not expose:
//   - `videoMetadata.startOffset/endOffset` — clipping a YouTube video to the
//     window being transcribed. Without it Gemini ingests the WHOLE video for
//     every window: a probe against a 40-minute shiur timed out at 120s,
//     while the same request clipped to 90 seconds returned in 30s.
//   - `mediaResolution: LOW` — a shiur is a person talking; the frames are
//     not the content, and low resolution cuts video tokens several-fold.
//
// Called only through lib/ai/service.ts (transcribeMediaWindow), which owns
// quota and model failover, like every other AI call in the app.

const BASE = "https://generativelanguage.googleapis.com";
const UPLOAD_TIMEOUT_MS = 120_000;
const TRANSCRIBE_TIMEOUT_MS = 150_000;

export function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

/** An HTTP failure carrying its status, so retryableError.ts can classify it. */
export class GeminiHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GeminiHttpError";
    this.status = status;
  }
}

async function failure(response: Response, context: string): Promise<GeminiHttpError> {
  let detail = "";
  try {
    const body = (await response.json()) as { error?: { message?: string; status?: string } };
    detail = [body.error?.status, body.error?.message].filter(Boolean).join(": ");
  } catch {
    // Non-JSON error body; the status is enough.
  }
  return new GeminiHttpError(response.status, `[gemini] ${context} failed (${response.status}) ${detail}`.trim());
}

export interface GeminiFile {
  /** "files/abc123" — the handle for get/delete. */
  name: string;
  /** The URI a generateContent request references. */
  uri: string;
  mimeType: string;
  state: "PROCESSING" | "ACTIVE" | "FAILED" | string;
  expirationTime?: string;
}

/**
 * Uploads media to the Files API (resumable protocol, single chunk).
 *
 * Files live for 48 hours, which comfortably covers transcribing a long shiur
 * window by window across several worker steps; the pipeline deletes the file
 * once analysis is done rather than waiting for expiry.
 */
export async function uploadGeminiFile(bytes: Uint8Array, mimeType: string, displayName: string): Promise<GeminiFile> {
  const key = geminiApiKey();

  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!start.ok) throw await failure(start, "file upload start");

  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("[gemini] file upload start returned no upload URL");

  const finish = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes as unknown as BodyInit,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!finish.ok) throw await failure(finish, "file upload");

  const { file } = (await finish.json()) as { file: GeminiFile };
  return file;
}

export async function getGeminiFile(name: string): Promise<GeminiFile | null> {
  const response = await fetch(`${BASE}/v1beta/${name}`, {
    headers: { "x-goog-api-key": geminiApiKey() },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw await failure(response, "file get");
  return (await response.json()) as GeminiFile;
}

/** Audio is usually ACTIVE immediately; larger files pass through PROCESSING. */
export async function waitForGeminiFileActive(name: string, timeoutMs = 60_000): Promise<GeminiFile> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const file = await getGeminiFile(name);
    if (!file) throw new Error("[gemini] uploaded file disappeared");
    if (file.state === "ACTIVE") return file;
    if (file.state === "FAILED") throw new Error("[gemini] the file could not be processed");
    if (Date.now() > deadline) throw new GeminiHttpError(504, "[gemini] file still processing — timeout");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

export async function deleteGeminiFile(name: string): Promise<void> {
  await fetch(`${BASE}/v1beta/${name}`, {
    method: "DELETE",
    headers: { "x-goog-api-key": geminiApiKey() },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}

export type MediaSource =
  | { kind: "file"; uri: string; mimeType: string }
  | { kind: "youtube"; url: string };

export interface WindowRequest {
  model: string;
  source: MediaSource;
  /** Absolute seconds. */
  start: number;
  end: number;
  /** "MM:SS" labels for the prompt. */
  from: string;
  to: string;
}

export interface RawWindowLine {
  start: string;
  text: string;
}

const LINE_SCHEMA = {
  type: "OBJECT",
  properties: {
    lines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "STRING", description: "זמן התחלה מוחלט במדיה, בפורמט MM:SS או HH:MM:SS" },
          text: { type: "STRING" },
        },
        required: ["start", "text"],
      },
    },
  },
  required: ["lines"],
};

function instruction(request: WindowRequest): string {
  const isVideo = request.source.kind === "youtube";
  return [
    `תמלל מילה במילה, בעברית, את הדיבור ${isVideo ? "בסרטון" : "בהקלטה"} בקטע שבין ${request.from} ל-${request.to} בלבד.`,
    "זהו שיעור תורה: כתוב מונחים, שמות ספרים ומראי מקומות בכתיב התורני המקובל (למשל: גמרא, רמב״ם, שולחן ערוך, בבא מציעא נ״ט ע״ב).",
    isVideo ? "תמלל רק את מה שנאמר בקול. התעלם מטקסט שמופיע על המסך." : "",
    "חלק לשורות של משפט אחד או שניים. לכל שורה ציין את זמן ההתחלה המוחלט שלה במדיה כולה (לא יחסית לתחילת הקטע).",
    "אם אין דיבור בקטע — החזר רשימה ריקה. אל תסכם, אל תשמיט ואל תוסיף.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Transcribes one window. Returns raw lines; normalizeWindowLines in
 * lib/torah/lessons/transcript.ts turns them into stored lines.
 */
export async function geminiTranscribeWindow(request: WindowRequest): Promise<RawWindowLine[]> {
  const mediaPart =
    request.source.kind === "youtube"
      ? {
          fileData: { fileUri: request.source.url },
          videoMetadata: { startOffset: `${Math.floor(request.start)}s`, endOffset: `${Math.ceil(request.end)}s` },
        }
      : { fileData: { fileUri: request.source.uri, mimeType: request.source.mimeType } };

  const response = await fetch(`${BASE}/v1beta/models/${request.model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": geminiApiKey() },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [mediaPart, { text: instruction(request) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: LINE_SCHEMA,
        temperature: 0,
        maxOutputTokens: 32_000,
        ...(request.source.kind === "youtube" ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}),
      },
    }),
    signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  });
  if (!response.ok) throw await failure(response, "transcribe window");

  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (json.promptFeedback?.blockReason) {
    throw new GeminiHttpError(422, `[gemini] request blocked: ${json.promptFeedback.blockReason}`);
  }

  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) return [];
  return parseLines(text, candidate?.finishReason === "MAX_TOKENS");
}

/**
 * Parses the JSON body, salvaging a response cut off at the token limit: the
 * complete lines before the cut are real transcript and worth keeping.
 */
export function parseLines(text: string, truncated: boolean): RawWindowLine[] {
  try {
    const parsed = JSON.parse(text) as { lines?: RawWindowLine[] };
    return Array.isArray(parsed.lines) ? parsed.lines : [];
  } catch {
    if (!truncated) throw new Error("[gemini] transcription response was not valid JSON");
    const lastComplete = text.lastIndexOf("}");
    if (lastComplete < 0) return [];
    try {
      const parsed = JSON.parse(`${text.slice(0, lastComplete + 1)}]}`) as { lines?: RawWindowLine[] };
      return Array.isArray(parsed.lines) ? parsed.lines : [];
    } catch {
      return [];
    }
  }
}
