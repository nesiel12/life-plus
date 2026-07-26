// Pure functions mapping Postgres rows (snake_case, per types/database.ts)
// onto the app's existing shapes (camelCase, per types/index.ts) — kept in
// one place so the store/components never need to know the DB's column
// naming, and so a schema column rename only ever touches this file.
import { LIFE_AREAS } from "@/lib/lifeAreas";
import type { Database } from "@/types/database";
import type {
  ChatMessage,
  Goal,
  Insight,
  KnowledgeEntry,
  LearningResource,
  LearningTopic,
  LifeArea,
  Meal,
  Moment,
  PersonalDNA,
  Person,
  UpcomingEvent,
  UserContext,
  Workout,
} from "@/types";
import type { GoalWithMilestones } from "@/lib/db/goals";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type LifeAreaScoreRow = Database["public"]["Tables"]["life_area_scores"]["Row"];
type PersonRow = Database["public"]["Tables"]["people"]["Row"];
type PersonUpdate = Database["public"]["Tables"]["people"]["Update"];
type MomentRow = Database["public"]["Tables"]["moments"]["Row"];
type UpcomingEventRow = Database["public"]["Tables"]["upcoming_events"]["Row"];
type KnowledgeEntryRow = Database["public"]["Tables"]["knowledge_entries"]["Row"];
type ChatMessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];
type InsightRow = Database["public"]["Tables"]["insights"]["Row"];
type PersonalDnaRow = Database["public"]["Tables"]["personal_dna"]["Row"];
type PersonalDnaUpdate = Database["public"]["Tables"]["personal_dna"]["Update"];
type LearningTopicRow = Database["public"]["Tables"]["learning_topics"]["Row"];
type LearningTopicUpdate = Database["public"]["Tables"]["learning_topics"]["Update"];
type LearningResourceRow = Database["public"]["Tables"]["learning_resources"]["Row"];
type LearningResourceUpdate = Database["public"]["Tables"]["learning_resources"]["Update"];
type MealRow = Database["public"]["Tables"]["meals"]["Row"];
type MealUpdate = Database["public"]["Tables"]["meals"]["Update"];
type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];
type WorkoutUpdate = Database["public"]["Tables"]["workouts"]["Update"];

export function toUserContext(row: UserRow): UserContext {
  return {
    name: row.name,
    hebrewName: row.hebrew_name ?? row.name,
    email: row.email,
    lifeStage: row.life_stage ?? "",
  };
}

export function toLifeArea(row: LifeAreaScoreRow): LifeArea {
  const meta = LIFE_AREAS[row.area_key];
  return {
    key: row.area_key,
    label: meta.label,
    colorVar: meta.colorVar,
    score: row.score,
    lastTouched: row.last_touched ?? undefined,
  };
}

export function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    hebrewName: row.hebrew_name ?? undefined,
    relation: row.relation,
    lastMeaningfulInteraction: row.last_meaningful_interaction ?? undefined,
    birthday: row.birthday ?? undefined,
    anniversary: row.anniversary ?? undefined,
    note: row.note ?? undefined,
    phone: row.phone ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
  };
}

// Shared by app/actions/people.ts's updatePersonAction — same camelCase-
// patch-to-snake_case-Update-row pattern as toPersonalDnaPatch, only
// including keys the caller actually provided so a partial edit (e.g. just
// the phone number) never clobbers fields it didn't touch.
export function toPersonPatch(patch: Partial<Person>): PersonUpdate {
  const row: PersonUpdate = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.hebrewName !== undefined) row.hebrew_name = patch.hebrewName || null;
  if (patch.relation !== undefined) row.relation = patch.relation;
  if (patch.birthday !== undefined) row.birthday = patch.birthday || null;
  if (patch.anniversary !== undefined) row.anniversary = patch.anniversary || null;
  if (patch.note !== undefined) row.note = patch.note || null;
  if (patch.phone !== undefined) row.phone = patch.phone || null;
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl || null;
  return row;
}

export function toMoment(row: MomentRow): Moment {
  return {
    id: row.id,
    timestamp: row.occurred_at,
    category: row.category,
    title: row.title,
    content: row.content,
    personId: row.person_id ?? undefined,
  };
}

export function toUpcomingEvent(row: UpcomingEventRow): UpcomingEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    category: row.category,
    googleEventId: row.google_event_id ?? undefined,
  };
}

export function toKnowledgeEntry(row: KnowledgeEntryRow): KnowledgeEntry {
  return {
    id: row.id,
    date: row.entry_date,
    topic: row.topic,
    source: row.source,
    summary: row.summary,
    durationMinutes: row.duration_minutes ?? undefined,
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    flashcards: row.flashcards ?? undefined,
    reviewQuestions: row.review_questions ?? undefined,
  };
}

export function toChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: row.created_at,
  };
}

export function toInsight(row: InsightRow): Insight {
  return {
    id: row.id,
    content: row.content,
    timestamp: row.created_at,
  };
}

export function toPersonalDNA(row: PersonalDnaRow | null): PersonalDNA {
  return {
    peakFocusHours: row?.peak_focus_hours ?? undefined,
    learningStyle: row?.learning_style ?? undefined,
    familyCheckInIntervalDays: row?.family_check_in_interval_days ?? undefined,
    habitNotes: row?.habit_notes ?? [],
    sleepNotes: row?.sleep_notes ?? undefined,
    careerNotes: row?.career_notes ?? undefined,
    motivationTriggers: row?.motivation_triggers ?? [],
  };
}

// Shared by app/actions/personalDna.ts's updatePersonalDNAAction and
// app/api/onboarding/message/route.ts — both take a camelCase Partial<PersonalDNA>
// patch and need the same snake_case conversion; only undefined fields are
// omitted so a caller can safely patch just the fields it actually has new
// values for without clobbering the rest on upsert.
export function toPersonalDnaPatch(patch: Partial<PersonalDNA>): PersonalDnaUpdate {
  const row: PersonalDnaUpdate = {};
  if (patch.peakFocusHours !== undefined) row.peak_focus_hours = patch.peakFocusHours;
  if (patch.learningStyle !== undefined) row.learning_style = patch.learningStyle;
  if (patch.familyCheckInIntervalDays !== undefined) row.family_check_in_interval_days = patch.familyCheckInIntervalDays;
  if (patch.habitNotes !== undefined) row.habit_notes = patch.habitNotes;
  if (patch.sleepNotes !== undefined) row.sleep_notes = patch.sleepNotes;
  if (patch.careerNotes !== undefined) row.career_notes = patch.careerNotes;
  if (patch.motivationTriggers !== undefined) row.motivation_triggers = patch.motivationTriggers;
  return row;
}

export function toLearningTopic(row: LearningTopicRow): LearningTopic {
  return {
    id: row.id,
    title: row.title,
    category: row.category ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function toLearningTopicPatch(patch: Partial<LearningTopic>): LearningTopicUpdate {
  const row: LearningTopicUpdate = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.category !== undefined) row.category = patch.category || null;
  if (patch.status !== undefined) row.status = patch.status;
  return row;
}

export function toLearningResource(row: LearningResourceRow): LearningResource {
  return {
    id: row.id,
    topicId: row.topic_id,
    type: row.type,
    title: row.title,
    url: row.url ?? undefined,
    notes: row.notes ?? undefined,
    isCompleted: row.is_completed,
    createdAt: row.created_at,
  };
}

export function toLearningResourcePatch(patch: Partial<LearningResource>): LearningResourceUpdate {
  const row: LearningResourceUpdate = {};
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.url !== undefined) row.url = patch.url || null;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  if (patch.isCompleted !== undefined) row.is_completed = patch.isCompleted;
  return row;
}

export function toMeal(row: MealRow): Meal {
  return {
    id: row.id,
    description: row.description,
    eatenAt: row.eaten_at,
    type: row.type,
    createdAt: row.created_at,
  };
}

export function toMealPatch(patch: Partial<Meal>): MealUpdate {
  const row: MealUpdate = {};
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.eatenAt !== undefined) row.eaten_at = patch.eatenAt;
  if (patch.type !== undefined) row.type = patch.type;
  return row;
}

export function toWorkout(row: WorkoutRow): Workout {
  return {
    id: row.id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    routineDetails: row.routine_details ?? undefined,
    createdAt: row.created_at,
  };
}

export function toWorkoutPatch(patch: Partial<Workout>): WorkoutUpdate {
  const row: WorkoutUpdate = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.startTime !== undefined) row.start_time = patch.startTime;
  if (patch.endTime !== undefined) row.end_time = patch.endTime ?? null;
  if (patch.routineDetails !== undefined) row.routine_details = patch.routineDetails || null;
  return row;
}

export function toGoal(row: GoalWithMilestones): Goal {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    createdAt: row.created_at,
    targetDate: row.target_date ?? undefined,
    personId: row.person_id ?? undefined,
    milestones: row.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      done: m.done,
      completedAt: m.completed_at ?? undefined,
      dueDate: m.due_date ?? undefined,
    })),
  };
}
