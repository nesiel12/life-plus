import { describe, expect, it } from "vitest";
import { LessonInAppMediaSchema, LessonMemeDataSchema, PioneerExternalLinkSchema } from "./learning";

// Regression coverage for the 2026-09-25 fix: these three fields used to be
// z.string().url(), which compiles to a JSON-schema "format": "uri"
// annotation — live-confirmed to make Groq's structured-output mode reject
// the WHOLE generation request outright ("unknown or unsupported string
// format 'uri'"), before a single token could be generated. Relaxed to a
// plain non-empty string: the model was never truly enforcing URL syntax
// server-side either way, and this is what actually unblocks the request.

describe("PioneerExternalLinkSchema.url", () => {
  it("still requires a non-empty string", () => {
    expect(PioneerExternalLinkSchema.safeParse({ title: "t", url: "", type: "article" }).success).toBe(false);
  });

  it("accepts a real URL, as before", () => {
    expect(PioneerExternalLinkSchema.safeParse({ title: "t", url: "https://example.com", type: "article" }).success).toBe(true);
  });

  it("no longer requires strict URL syntax — the point of the fix", () => {
    expect(PioneerExternalLinkSchema.safeParse({ title: "t", url: "לא באמת קישור", type: "article" }).success).toBe(true);
  });
});

// A second, later 2026-09-25 fix on the same fields (plus funnyQuizAnswers/
// youtubeVideoId/videoChapters, which never had a .url() problem but the
// same underlying one): .optional() → .nullable(). Groq's strict
// structured-output mode requires every schema property to be listed in
// `required`, expressing "this can be absent" as "this can be null"
// instead of as an omittable key — live-confirmed: with .optional() intact,
// generation failed outright ("`required` is required to be supplied...");
// switching to .nullable() made the identical generation succeed in under
// a second. Every field below must now be explicitly present (as a value
// or null), not omitted, which is why these payloads look more verbose
// than before.

describe("LessonMemeDataSchema", () => {
  it("accepts a non-URL-shaped non-empty imageUrl", () => {
    expect(LessonMemeDataSchema.safeParse({ imageUrl: "not-a-url", jokeText: "j", funnyQuizAnswers: null }).success).toBe(true);
  });

  it("requires imageUrl and funnyQuizAnswers to be present, even as null — not omitted", () => {
    expect(LessonMemeDataSchema.safeParse({ jokeText: "j" }).success).toBe(false);
  });

  it("accepts null for both optional fields", () => {
    expect(LessonMemeDataSchema.safeParse({ imageUrl: null, jokeText: "j", funnyQuizAnswers: null }).success).toBe(true);
  });
});

describe("LessonInAppMediaSchema", () => {
  it("accepts non-URL-shaped audioSnippets entries", () => {
    expect(
      LessonInAppMediaSchema.safeParse({ youtubeVideoId: null, videoChapters: null, audioSnippets: ["not-a-url"] }).success
    ).toBe(true);
  });

  it("requires all three fields present, even as null — not omitted", () => {
    expect(LessonInAppMediaSchema.safeParse({}).success).toBe(false);
  });

  it("accepts null for all three", () => {
    expect(LessonInAppMediaSchema.safeParse({ youtubeVideoId: null, videoChapters: null, audioSnippets: null }).success).toBe(true);
  });
});
