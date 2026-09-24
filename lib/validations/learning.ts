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
  StepBriefContent,
  StepBriefRequest,
  StepConcept,
  StepKeyFigure,
  StepRecallItem,
  StepVisual,
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

// EmbeddedArticleReader.tsx's in-app reader — a distinct, smaller domain
// from the masterclass lesson block above, but kept in this same file
// rather than a new one: two short schemas, not worth splitting out.

export const ArticleExtractRequestSchema = z.object({
  url: z.string().trim().url(),
});

/** What app/api/learning/article/extract/route.ts asks the model to pick, given a numbered list of the article's own paragraphs. */
export const ArticleKeyParagraphsSchema = z.object({
  keyParagraphs: z
    .array(
      z.object({
        /** Index into the paragraphs array handed to the model — validated in range by lib/learning/articleExtract.ts's clampKeyParagraphs, not trusted as-is. */
        index: z.number().int().min(0),
        /** Hebrew, RTL — one line on why this paragraph matters. */
        note: z.string().trim().min(1).max(200),
      })
    )
    .max(4),
});

export const ArticleExplainRequestSchema = z.object({
  url: z.string().trim().url(),
  paragraph: z.string().trim().min(1).max(4000),
});

// --- Step brief (types/learning.ts StepBriefContent) ---------------------
//
// Constraints are kept loose on purpose (generous maxima, no exact counts):
// this schema is handed to the model as its streaming output schema, and a
// brief that comes back with 7 concepts instead of 6 is still a perfectly
// good brief — failing it would only cost the learner a wait.

export const StepConceptSchema: z.ZodType<StepConcept> = z.object({
  term: z.string().trim().min(1).max(80),
  definition: z.string().trim().min(1).max(600),
  relatedTo: z.array(z.string().trim().min(1)).max(8),
});

export const StepKeyFigureSchema: z.ZodType<StepKeyFigure> = z.object({
  name: z.string().trim().min(1).max(120),
  contribution: z.string().trim().min(1).max(400),
});

export const StepVisualSchema: z.ZodType<StepVisual> = z.object({
  kind: z.enum(["process", "comparison", "none"]),
  title: z.string().trim().max(120),
  processStages: z.array(z.object({ title: z.string().trim().min(1).max(80), detail: z.string().trim().max(300) })).max(8),
  comparisonColumns: z.array(z.string().trim().min(1).max(60)).max(4),
  comparisonRows: z.array(z.object({ label: z.string().trim().min(1).max(80), cells: z.array(z.string().trim().max(200)).max(4) })).max(8),
});

export const StepRecallItemSchema: z.ZodType<StepRecallItem> = z.object({
  sentence: z.string().trim().min(1).max(400),
  answer: z.string().trim().min(1).max(80),
  acceptableAnswers: z.array(z.string().trim().min(1).max(80)).max(6),
  hint: z.string().trim().max(200),
});

export const StepBriefContentSchema: z.ZodType<StepBriefContent> = z.object({
  summary: z.string().trim().min(1).max(1200),
  coreConcepts: z.array(StepConceptSchema).min(1).max(8),
  keyFigures: z.array(StepKeyFigureSchema).max(4),
  visual: StepVisualSchema,
  recall: z.array(StepRecallItemSchema).max(4),
  feynmanConcept: z.string().trim().min(1).max(120),
  practice: z.object({
    title: z.string().trim().min(1).max(120),
    instructions: z.string().trim().min(1).max(800),
    estimatedMinutes: z.number().int().min(1).max(240),
  }),
});

export const StepBriefRequestSchema: z.ZodType<StepBriefRequest> = z.object({
  topicId: z.string().trim().min(1),
  stepId: z.string().trim().min(1),
});
