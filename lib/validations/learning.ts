import { z } from "zod";
import { TEACHING_MODES, USER_AGE_GROUPS } from "@/types/learning";
import type {
  InlineCheckpoint,
  LessonBlockContent,
  LessonGenerateRequest,
  LessonInAppMedia,
  LessonMemeData,
  LessonVideoChapter,
  PioneerExternalLink,
  PioneerProfile,
} from "@/types/learning";

// Zod schemas for the Masterclass & Gaming OS's generated lesson content.
// Every schema here is annotated `z.ZodType<TheMatchingType>` from
// types/learning.ts — not for documentation, but so TypeScript itself
// refuses to compile if a schema's inferred shape ever drifts from the
// hand-written interface it's supposed to validate. The two files are
// meant to be edited together; this is what makes forgetting one a
// compile error instead of a runtime surprise months later.
//
// These schemas are also literally what app/api/learning/lesson/generate/
// route.ts hands to generateStructuredData() as the AI SDK's own output
// schema — so validation isn't just a safeParse() after the fact, it's
// enforced at generation time too (see that route for the explicit
// .safeParse() + one retry on top of that, for the rare near-miss the SDK's
// own repair pass doesn't catch).

export const UserAgeGroupSchema = z.enum(USER_AGE_GROUPS);
export const TeachingModeSchema = z.enum(TEACHING_MODES);

export const PioneerExternalLinkSchema: z.ZodType<PioneerExternalLink> = z.object({
  title: z.string().trim().min(1),
  url: z.string().trim().url(),
  type: z.enum(["article", "video", "audio"]),
});

export const PioneerProfileSchema: z.ZodType<PioneerProfile> = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  historicalEra: z.string().trim().min(1),
  bio: z.string().trim().min(1),
  famousQuote: z.string().trim().min(1),
  unusualFact: z.string().trim().min(1),
  externalLinks: z.array(PioneerExternalLinkSchema),
});

export const InlineCheckpointSchema: z.ZodType<InlineCheckpoint> = z.object({
  id: z.string().trim().min(1),
  question: z.string().trim().min(1),
  // Exactly 4 — a multiple-choice checkpoint with any other count isn't
  // renderable by the fixed 4-option UI this feeds.
  options: z.array(z.string().trim().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1),
  funnyDistractor: z.string().trim().min(1).optional(),
});

export const LessonMemeDataSchema: z.ZodType<LessonMemeData> = z.object({
  imageUrl: z.string().trim().url().optional(),
  jokeText: z.string().trim().min(1),
  funnyQuizAnswers: z.array(z.string().trim().min(1)).optional(),
});

export const LessonVideoChapterSchema: z.ZodType<LessonVideoChapter> = z.object({
  time: z.number().int().min(0),
  label: z.string().trim().min(1),
});

export const LessonInAppMediaSchema: z.ZodType<LessonInAppMedia> = z.object({
  // A bare 11-char YouTube id, not a full URL — what the video embed
  // component actually needs, and it rules out someone pasting a full
  // watch?v=... link into the field by mistake.
  youtubeVideoId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{11}$/)
    .optional(),
  videoChapters: z.array(LessonVideoChapterSchema).optional(),
  audioSnippets: z.array(z.string().trim().url()).optional(),
});

export const LessonBlockContentSchema: z.ZodType<LessonBlockContent> = z.object({
  originStory: z.string().trim().min(1),
  pioneers: z.array(PioneerProfileSchema),
  coreContent: z.string().trim().min(1),
  blooperOrDisaster: z.string().trim().min(1),
  mindBlowingTrivia: z.array(z.string().trim().min(1)),
  memeData: LessonMemeDataSchema,
  inAppMedia: LessonInAppMediaSchema,
  inlineCheckpoints: z.array(InlineCheckpointSchema),
});

export const LessonGenerateRequestSchema: z.ZodType<LessonGenerateRequest> = z.object({
  topicId: z.string().trim().min(1),
  stepId: z.string().trim().min(1),
  userAgeGroup: UserAgeGroupSchema,
  teachingMode: TeachingModeSchema,
  customEmphasis: z.string().trim().min(1).max(300).optional(),
});
