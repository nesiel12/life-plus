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
  LifeArea,
  Moment,
  PersonalDNA,
  Person,
  UpcomingEvent,
  UserContext,
} from "@/types";
import type { GoalWithMilestones } from "@/lib/db/goals";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type LifeAreaScoreRow = Database["public"]["Tables"]["life_area_scores"]["Row"];
type PersonRow = Database["public"]["Tables"]["people"]["Row"];
type MomentRow = Database["public"]["Tables"]["moments"]["Row"];
type UpcomingEventRow = Database["public"]["Tables"]["upcoming_events"]["Row"];
type KnowledgeEntryRow = Database["public"]["Tables"]["knowledge_entries"]["Row"];
type ChatMessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];
type InsightRow = Database["public"]["Tables"]["insights"]["Row"];
type PersonalDnaRow = Database["public"]["Tables"]["personal_dna"]["Row"];
type PersonalDnaUpdate = Database["public"]["Tables"]["personal_dna"]["Update"];

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
  };
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
