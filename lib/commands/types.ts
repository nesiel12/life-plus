import { z } from "zod";

export const MOMENT_CATEGORY_KEYS = ["faith", "family", "knowledge", "health", "career", "general"] as const;
export const LIFE_AREA_KEYS = ["faith", "family", "knowledge", "health", "career"] as const;
export const COMMAND_PERIODS = ["morning", "afternoon", "evening", "night"] as const;
export const COMMAND_DAYS = ["today", "tomorrow"] as const;
export const CHECK_IN_ACTIVITIES = [
  "work",
  "study",
  "training",
  "family",
  "friends",
  "rest",
  "errands",
  "other",
] as const;
export const ROUTINE_KIND_KEYS = [
  "work",
  "study",
  "torah",
  "training",
  "rest",
  "meal",
  "commute",
  "family",
  "free",
  "other",
] as const;

// The bounded set of things a free-text command can actually do
// (docs/ATLAS_ARCHITECTURE_VISION.md §12) — not a general agent over
// arbitrary app state. Each maps to either an existing, already-tested store
// action or a real capability with its own confirm step.
//
// "unclear" is a real, expected outcome, not an error: the model is told to
// use it whenever a message isn't clearly one of the others, rather than
// guessing. That is what stops "תוסיף מטרה" creating a goal called "מטרה".
//
// Every intent here is still a PROPOSAL. Nothing in this file executes;
// the client confirms and only then acts.
export const CommandIntentSchema = z.object({
  reply: z.string().min(1),
  intent: z.enum([
    "add_moment",
    "add_goal",
    "add_task",
    "add_calendar_event",
    "add_routine_block",
    "log_check_in",
    "log_family_interaction",
    "clear_calendar_range",
    "unclear",
  ]),
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
  addTask: z
    .object({
      title: z.string().min(1),
      /** Local wall clock "YYYY-MM-DDTHH:MM", or a bare date. Omitted when unsaid. */
      dueAt: z.string().optional(),
      isHighPriority: z.boolean().optional(),
    })
    .optional(),
  addCalendarEvent: z
    .object({
      title: z.string().min(1),
      /** Local wall clock, "YYYY-MM-DDTHH:MM". */
      start: z.string().min(1),
      end: z.string().min(1),
    })
    .optional(),
  addRoutineBlock: z
    .object({
      title: z.string().min(1),
      kind: z.enum(ROUTINE_KIND_KEYS),
      /** Sunday = 0. */
      weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      /** "HH:MM". */
      startTime: z.string().min(1),
      endTime: z.string().min(1),
    })
    .optional(),
  logCheckIn: z
    .object({
      activity: z.enum(CHECK_IN_ACTIVITIES),
      energy: z.number().int().min(1).max(5),
      note: z.string().optional(),
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
