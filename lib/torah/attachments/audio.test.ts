import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_STATUS_LABELS,
  AUDIO_ENTITY_LABELS,
  attachmentStoragePath,
  attachmentTitleFromFileName,
  audioProgressView,
  canTranscribe,
  extensionForMime,
  fileSizeLabel,
  isAudioActive,
  readAudioProgress,
  recordingTitle,
  sortAttachments,
  toAttachmentView,
} from "@/lib/torah/attachments/audio";
import type { Database } from "@/types/database";

type AudioRow = Database["public"]["Tables"]["entity_audio"]["Row"];

function row(overrides: Partial<AudioRow> = {}): AudioRow {
  return {
    id: "a1",
    user_id: "u1",
    entity_type: "book",
    entity_id: "b1",
    title: "הקלטה מהשיעור",
    storage_path: "u1/attachments/a1/audio.mp3",
    mime: "audio/mpeg",
    size_bytes: 2_500_000,
    duration_seconds: 630,
    source: "upload",
    status: "stored",
    transcript: null,
    transcript_lines: [],
    transcript_provider: null,
    error: null,
    progress: {},
    lease_until: null,
    attempts: 0,
    created_at: "2026-09-18T08:00:00.000Z",
    updated_at: "2026-09-18T08:00:00.000Z",
    ...overrides,
  };
}

describe("labels", () => {
  it("names every entity kind and every status in Hebrew", () => {
    for (const label of [...Object.values(AUDIO_ENTITY_LABELS), ...Object.values(ATTACHMENT_STATUS_LABELS)]) {
      expect(label).not.toMatch(/[A-Za-z]/);
      expect(label.length).toBeGreaterThan(1);
    }
    expect(AUDIO_ENTITY_LABELS.rabbi).toBe("רב");
    expect(ATTACHMENT_STATUS_LABELS.transcribing).toBe("מתמלל");
  });
});

describe("transcription gating", () => {
  it("offers transcription for a stored recording and for a retry after failure", () => {
    expect(canTranscribe("stored")).toBe(true);
    expect(canTranscribe("failed")).toBe(true);
  });

  it("never offers it while uploading, mid-transcription, or once done", () => {
    expect(canTranscribe("uploading")).toBe(false);
    expect(canTranscribe("transcribing")).toBe(false);
    expect(canTranscribe("ready")).toBe(false);
  });

  it("knows which status means a worker should be running", () => {
    expect(isAudioActive("transcribing")).toBe(true);
    expect(isAudioActive("stored")).toBe(false);
  });
});

describe("audioProgressView", () => {
  it("is zero for a stored recording nobody asked to transcribe", () => {
    expect(audioProgressView(row())).toMatchObject({ fraction: 0, windowsDone: 0, windowsTotal: 0 });
  });

  it("shows a sliver as soon as transcription is requested, before windows are planned", () => {
    expect(audioProgressView(row({ status: "transcribing" })).fraction).toBe(0.02);
  });

  it("counts finished windows, and never reports 100% before the row says ready", () => {
    const progress = { windows: [{ start: 0, end: 600 }, { start: 600, end: 900 }], nextWindow: 2 };
    expect(audioProgressView(row({ status: "transcribing", progress })).fraction).toBe(0.99);
    expect(audioProgressView(row({ status: "transcribing", progress: { ...progress, nextWindow: 1 } })).fraction).toBe(0.5);
  });

  it("is complete once the row is ready", () => {
    expect(audioProgressView(row({ status: "ready" })).fraction).toBe(1);
  });

  it("surfaces a quota pause with its reason", () => {
    const view = audioProgressView(
      row({ status: "transcribing", progress: { pausedUntil: "2026-09-19T00:00:00.000Z", pauseReason: "מכסה" } })
    );
    expect(view).toMatchObject({ pausedUntil: "2026-09-19T00:00:00.000Z", pauseReason: "מכסה" });
  });

  it("reads a malformed progress column without throwing", () => {
    expect(readAudioProgress(null)).toEqual({});
    expect(readAudioProgress("nonsense")).toEqual({});
    expect(audioProgressView(row({ progress: null as never })).fraction).toBe(0);
  });

  it("does not count a cursor past the planned windows", () => {
    const progress = { windows: [{ start: 0, end: 60 }], nextWindow: 7 };
    expect(audioProgressView(row({ status: "transcribing", progress })).windowsDone).toBe(1);
  });
});

describe("toAttachmentView", () => {
  it("maps a row to the client shape, parsing stored transcript lines", () => {
    const view = toAttachmentView(
      row({
        status: "ready",
        transcript: "שורה ראשונה שורה שנייה",
        transcript_lines: [
          { start: 0, end: 4, text: "שורה ראשונה" },
          { start: 4, end: 9, text: "שורה שנייה" },
        ],
        transcript_provider: "gemini",
      }),
      "https://signed.example/audio.mp3"
    );

    expect(view).toMatchObject({
      id: "a1",
      entityType: "book",
      entityId: "b1",
      title: "הקלטה מהשיעור",
      status: "ready",
      mediaUrl: "https://signed.example/audio.mp3",
      transcriptProvider: "gemini",
    });
    expect(view.transcriptLines).toHaveLength(2);
    expect(view.transcriptLines[1]).toEqual({ start: 4, end: 9, text: "שורה שנייה" });
    expect(view.progress.fraction).toBe(1);
  });

  it("has no media URL until one is signed, and tolerates junk in the lines column", () => {
    const view = toAttachmentView(row({ transcript_lines: "not lines" as never }));
    expect(view.mediaUrl).toBeNull();
    expect(view.transcriptLines).toEqual([]);
  });

  it("carries the Hebrew failure reason", () => {
    expect(toAttachmentView(row({ status: "failed", error: "לא נמצא דיבור" })).error).toBe("לא נמצא דיבור");
  });
});

describe("titles", () => {
  it("makes a readable title from a file name", () => {
    expect(attachmentTitleFromFileName("shiur_moktze_2026.mp3")).toBe("shiur moktze 2026");
    expect(attachmentTitleFromFileName("הלכות שבת.m4a")).toBe("הלכות שבת");
  });

  it("never returns an empty title", () => {
    expect(attachmentTitleFromFileName(".mp3")).toBe("הקלטה");
    expect(attachmentTitleFromFileName("   ", "ברירת מחדל")).toBe("ברירת מחדל");
  });

  it("clips an absurdly long file name", () => {
    expect(attachmentTitleFromFileName(`${"א".repeat(300)}.wav`).length).toBeLessThanOrEqual(120);
  });

  it("stamps a browser recording with its time, so a list of them is readable", () => {
    const title = recordingTitle(new Date("2026-09-18T18:04:00.000Z"), "Asia/Jerusalem");
    expect(title.startsWith("הקלטה · ")).toBe(true);
    expect(title).toContain("21:04");
  });
});

describe("storage paths", () => {
  it("puts an attachment under its owner and its own id", () => {
    expect(attachmentStoragePath("u1", "a1", "mp3")).toBe("u1/attachments/a1/audio.mp3");
  });

  it("refuses anything that is not a plain extension — the id is not a path", () => {
    expect(attachmentStoragePath("u1", "a1", "../../etc/passwd")).toBe("u1/attachments/a1/audio.audio");
    expect(attachmentStoragePath("u1", "a1", "")).toBe("u1/attachments/a1/audio.audio");
  });

  it("maps every accepted mime to its extension, and anything else to a safe default", () => {
    expect(extensionForMime("audio/mpeg")).toBe("mp3");
    expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMime("audio/MP4")).toBe("m4a");
    expect(extensionForMime("application/zip")).toBe("audio");
  });
});

describe("list helpers", () => {
  it("sorts newest first without mutating the input", () => {
    const items = [{ createdAt: "2026-09-01T00:00:00Z" }, { createdAt: "2026-09-18T00:00:00Z" }];
    expect(sortAttachments(items)[0].createdAt).toBe("2026-09-18T00:00:00Z");
    expect(items[0].createdAt).toBe("2026-09-01T00:00:00Z");
  });

  it("labels sizes the way a person reads them", () => {
    expect(fileSizeLabel(850_000)).toBe("830KB");
    expect(fileSizeLabel(4_400_000)).toBe("4.2MB");
    expect(fileSizeLabel(0)).toBeNull();
    expect(fileSizeLabel(null)).toBeNull();
  });
});
