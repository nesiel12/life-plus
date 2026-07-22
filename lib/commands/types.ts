import { z } from "zod";

export const MOMENT_CATEGORY_KEYS = ["faith", "family", "knowledge", "health", "career", "general"] as const;
export const LIFE_AREA_KEYS = ["faith", "family", "knowledge", "health", "career"] as const;
export const COMMAND_PERIODS = ["morning", "afternoon", "evening", "night"] as const;
export const COMMAND_DAYS = ["today", "tomorrow"] as const;

// The small, deliberately bounded set of things a free-text command can
// actually do (docs/ATLAS_ARCHITECTURE_VISION.md §12) — not a general
// agent over arbitrary app state. Each maps to either an existing, already-
// tested store action (add_moment/add_goal/log_family_interaction, executed
// client-side on confirm) or a new real capability this milestone adds
// (clear_calendar_range, executed server-side since it needs the user's
// Google access token). "unclear" is a real, expected outcome, not an
// error — the model is told to use it whenever a message isn't clearly one
// of the other four, rather than guessing.
export const CommandIntentSchema = z.object({
  reply: z.string().min(1),
  intent: z.enum(["add_moment", "add_goal", "log_family_interaction", "clear_calendar_range", "unclear"]),
  addMoment: z
    .object({
      category: z.enum(MOMENT_CATEGORY_KEYS),
      title: z.string().min(1),
      content: z.string().min(1),
    })
    .optional(),
  addGoal: z
    .object({
      title: z.string().min(1),
      category: z.enum(LIFE_AREA_KEYS),
    })
    .optional(),
  logFamilyInteraction: z
    .object({
      personName: z.string().min(1),
      note: z.string().optional(),
    })
    .optional(),
  clearCalendarRange: z
    .object({
      period: z.enum(COMMAND_PERIODS),
      day: z.enum(COMMAND_DAYS),
    })
    .optional(),
});
export type CommandIntentResult = z.infer<typeof CommandIntentSchema>;
