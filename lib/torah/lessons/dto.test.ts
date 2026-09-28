import { describe, expect, it } from "vitest";
import { toProgressView } from "@/lib/torah/lessons/dto";
import type { Database, Json } from "@/types/database";

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];

function row(overrides: Partial<LessonRow>): LessonRow {
  return {
    id: "lesson-1",
    user_id: "user-1",
    title: "שיעור",
    kind: "youtube",
    source_url: "https://youtube.com/watch?v=x",
    storage_path: null,
    duration_seconds: 3600,
    status: "transcribing",
    error: null,
    book_id: null,
    rabbi_id: null,
    knowledge_entry_id: null,
    lesson_date: "2026-09-01",
    progress: {} as Json,
    lease_until: null,
    attempts: 0,
    media_mime: null,
    media_size_bytes: null,
    summary: null,
    key_points: [] as unknown as Json,
    speaker: null,
    processed_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("toProgressView", () => {
  it("a fresh, not-yet-started lesson is near zero", () => {
    const view = toProgressView(row({ status: "pending", progress: {} as Json }));
    expect(view.phase).toBe("waiting");
    expect(view.fraction).toBe(0.02);
  });

  it("a lesson mid-transcription reports its window progress", () => {
    const progress = { phase: "transcribe", windows: Array(10).fill({ start: 0, end: 1 }), nextWindow: 4 };
    const view = toProgressView(row({ status: "transcribing", progress: progress as unknown as Json }));
    expect(view.phase).toBe("transcribe");
    expect(view.windowsDone).toBe(4);
    expect(view.windowsTotal).toBe(10);
    expect(view.fraction).toBeCloseTo(0.05 + 0.75 * 0.4, 5);
  });

  // The bug: a lesson that failed on window 14 of 15 used to report fraction
  // 0, indistinguishable from one that never started at all.
  it("a lesson that failed deep into transcription keeps its progress, not zero", () => {
    const progress = { phase: "transcribe", windows: Array(15).fill({ start: 0, end: 1 }), nextWindow: 14, lastError: "תמלול קטע מהשיעור נכשל." };
    const view = toProgressView(row({ status: "failed", progress: progress as unknown as Json }));
    expect(view.phase).toBe("transcribe");
    expect(view.windowsDone).toBe(14);
    expect(view.fraction).toBeCloseTo(0.05 + 0.75 * (14 / 15), 5);
    expect(view.fraction).toBeGreaterThan(0.7);
  });

  it("a lesson that failed during analysis keeps the analyze fraction", () => {
    const progress = { phase: "analyze", lastError: "ניתוח השיעור נכשל." };
    const view = toProgressView(row({ status: "failed", progress: progress as unknown as Json }));
    expect(view.phase).toBe("analyze");
    expect(view.fraction).toBe(0.82);
  });

  it("a lesson that failed before any phase was recorded is near zero, not misleadingly exact zero", () => {
    const view = toProgressView(row({ status: "failed", progress: { lastError: "לא ניתן לקבוע את אורך הסרטון." } as unknown as Json }));
    expect(view.phase).toBe("waiting");
    expect(view.fraction).toBe(0.02);
  });

  it("a ready lesson is always fraction 1 regardless of stored progress", () => {
    const view = toProgressView(row({ status: "ready", progress: { phase: "transcribe", nextWindow: 0 } as unknown as Json }));
    expect(view.phase).toBe("done");
    expect(view.fraction).toBe(1);
  });
});
