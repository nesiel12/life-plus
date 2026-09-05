// Pure functions mapping Postgres rows (snake_case, per types/database.ts)
// onto the app's existing shapes (camelCase, per types/index.ts) — kept in
// one place so the store/components never need to know the DB's column
// naming, and so a schema column rename only ever touches this file.
import { LIFE_AREAS, LIFE_AREA_LIST } from "@/lib/lifeAreas";
import { isDayPart } from "@/lib/onboarding/chronotype";
import type { Database, Json } from "@/types/database";
import type {
  Book,
  ChronotypeSettings,
  DayPart,
  ChatMessage,
  Goal,
  Habit,
  HabitLog,
  Insight,
  KnowledgeEntry,
  LearningResource,
  LearningTopic,
  LifeArea,
  LifeAreaKey,
  ManualEvent,
  Meal,
  Moment,
  PersonalDNA,
  Person,
  Rabbi,
  Summary,
  Task,
  Transaction,
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
type BookRow = Database["public"]["Tables"]["books"]["Row"];
type BookUpdate = Database["public"]["Tables"]["books"]["Update"];
type RabbiRow = Database["public"]["Tables"]["rabbis"]["Row"];
type RabbiUpdate = Database["public"]["Tables"]["rabbis"]["Update"];
type SummaryRow = Database["public"]["Tables"]["summaries"]["Row"];
type SummaryUpdate = Database["public"]["Tables"]["summaries"]["Update"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
type HabitRow = Database["public"]["Tables"]["habits"]["Row"];
type HabitLogRow = Database["public"]["Tables"]["habit_logs"]["Row"];
type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
type TransactionUpdate = Database["public"]["Tables"]["transactions"]["Update"];
type ManualEventRow = Database["public"]["Tables"]["manual_events"]["Row"];
type ManualEventUpdate = Database["public"]["Tables"]["manual_events"]["Update"];
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
    gender: (row.gender as Person["gender"]) ?? undefined,
    role: (row.role as Person["role"]) ?? undefined,
    messageTemplate: row.message_template ?? undefined,
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
  if (patch.gender !== undefined) row.gender = patch.gender || null;
  if (patch.role !== undefined) row.role = patch.role || null;
  if (patch.messageTemplate !== undefined) row.message_template = patch.messageTemplate || null;
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
    pinnedAt: row.pinned_at ?? undefined,
  };
}

export function toInsight(row: InsightRow): Insight {
  return {
    id: row.id,
    content: row.content,
    timestamp: row.created_at,
  };
}

// jsonb is schemaless on the way out, so both structured columns are parsed
// defensively rather than cast: a hand-edited row or a shape from an older
// build must not crash the dashboard on hydrate.
function toChronotype(value: unknown): ChronotypeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const parts = (key: string): DayPart[] | undefined => {
    const list = raw[key];
    if (!Array.isArray(list)) return undefined;
    const valid = list.filter(isDayPart);
    return valid.length > 0 ? valid : undefined;
  };
  return {
    wakeTime: typeof raw.wakeTime === "string" ? raw.wakeTime : undefined,
    sleepTime: typeof raw.sleepTime === "string" ? raw.sleepTime : undefined,
    peakFocusHours: parts("peakFocusHours"),
    lowEnergyHours: parts("lowEnergyHours"),
  };
}

function toCorePriorities(value: unknown): LifeAreaKey[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set(LIFE_AREA_LIST.map((area) => area.key));
  // Dedupe as well as validate — order carries the ranking, so a repeated
  // key would silently outrank whatever followed it.
  const seen = new Set<LifeAreaKey>();
  const out: LifeAreaKey[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && keys.has(entry as LifeAreaKey) && !seen.has(entry as LifeAreaKey)) {
      seen.add(entry as LifeAreaKey);
      out.push(entry as LifeAreaKey);
    }
  }
  return out;
}

export function toPersonalDNA(row: PersonalDnaRow | null): PersonalDNA {
  return {
    fullName: row?.full_name ?? undefined,
    birthDate: row?.birth_date ?? undefined,
    chronotype: toChronotype(row?.chronotype_settings),
    corePriorities: toCorePriorities(row?.core_priorities),
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
  if (patch.fullName !== undefined) row.full_name = patch.fullName || null;
  if (patch.birthDate !== undefined) row.birth_date = patch.birthDate || null;
  if (patch.chronotype !== undefined) row.chronotype_settings = patch.chronotype as Json;
  if (patch.corePriorities !== undefined) row.core_priorities = patch.corePriorities as Json;
  if (patch.peakFocusHours !== undefined) row.peak_focus_hours = patch.peakFocusHours;
  if (patch.learningStyle !== undefined) row.learning_style = patch.learningStyle;
  if (patch.familyCheckInIntervalDays !== undefined) row.family_check_in_interval_days = patch.familyCheckInIntervalDays;
  if (patch.habitNotes !== undefined) row.habit_notes = patch.habitNotes;
  if (patch.sleepNotes !== undefined) row.sleep_notes = patch.sleepNotes;
  if (patch.careerNotes !== undefined) row.career_notes = patch.careerNotes;
  if (patch.motivationTriggers !== undefined) row.motivation_triggers = patch.motivationTriggers;
  return row;
}

export function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? undefined,
    category: row.category ?? undefined,
    notes: row.notes ?? undefined,
  };
}

// Same partial-patch convention as toPersonPatch: only keys the caller
// actually provided are included, so a partial edit never clobbers a field
// it didn't touch.
export function toBookPatch(patch: Partial<Book>): BookUpdate {
  const row: BookUpdate = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.author !== undefined) row.author = patch.author || null;
  if (patch.category !== undefined) row.category = patch.category || null;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  return row;
}

export function toRabbi(row: RabbiRow): Rabbi {
  return {
    id: row.id,
    name: row.name,
    title: row.title ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export function toRabbiPatch(patch: Partial<Rabbi>): RabbiUpdate {
  const row: RabbiUpdate = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.title !== undefined) row.title = patch.title || null;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  return row;
}

export function toSummary(row: SummaryRow): Summary {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    contentHtml: row.content_html ?? undefined,
    isDraft: row.is_draft ?? false,
    entityType: (row.entity_type as Summary["entityType"]) ?? undefined,
    entityId: row.entity_id ?? undefined,
    mentions: (row.mentions as Summary["mentions"]) ?? [],
    date: row.summary_date,
  };
}

export function toSummaryPatch(patch: Partial<Summary>): SummaryUpdate {
  const row: SummaryUpdate = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.content !== undefined) row.content = patch.content;
  if (patch.contentHtml !== undefined) row.content_html = patch.contentHtml || null;
  if (patch.isDraft !== undefined) row.is_draft = patch.isDraft;
  if (patch.entityType !== undefined) row.entity_type = patch.entityType || null;
  if (patch.entityId !== undefined) row.entity_id = patch.entityId || null;
  if (patch.mentions !== undefined) row.mentions = patch.mentions as Json;
  if (patch.date !== undefined) row.summary_date = patch.date;
  return row;
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    dueDate: row.due_date ?? undefined,
    isHighPriority: row.is_high_priority,
    createdAt: row.created_at,
  };
}

export function toTaskPatch(patch: Partial<Task>): TaskUpdate {
  const row: TaskUpdate = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description || null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate || null;
  if (patch.isHighPriority !== undefined) row.is_high_priority = patch.isHighPriority;
  return row;
}

export function toHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
  };
}

export function toHabitLog(row: HabitLogRow): HabitLog {
  return {
    id: row.id,
    habitId: row.habit_id,
    completedDate: row.completed_date,
  };
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type,
    title: row.title,
    category: row.category,
    date: row.transaction_date,
    note: row.note ?? undefined,
    isShift: row.is_shift,
    hourlyRate: row.hourly_rate ?? undefined,
    shiftStart: row.shift_start ?? undefined,
    shiftEnd: row.shift_end ?? undefined,
    employer: row.employer ?? undefined,
    isRecurring: row.is_recurring,
    createdAt: row.created_at,
  };
}

export function toTransactionPatch(patch: Partial<Transaction>): TransactionUpdate {
  const row: TransactionUpdate = {};
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.date !== undefined) row.transaction_date = patch.date;
  if (patch.note !== undefined) row.note = patch.note || null;
  if (patch.isShift !== undefined) row.is_shift = patch.isShift;
  if (patch.hourlyRate !== undefined) row.hourly_rate = patch.hourlyRate ?? null;
  if (patch.shiftStart !== undefined) row.shift_start = patch.shiftStart ?? null;
  if (patch.shiftEnd !== undefined) row.shift_end = patch.shiftEnd ?? null;
  if (patch.employer !== undefined) row.employer = patch.employer || null;
  if (patch.isRecurring !== undefined) row.is_recurring = patch.isRecurring;
  return row;
}

export function toManualEvent(row: ManualEventRow): ManualEvent {
  return {
    id: row.id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    category: row.category ?? undefined,
    reminderMinutes: row.reminder_minutes ?? undefined,
    linkedContactIds: row.linked_contact_ids ?? [],
    createdAt: row.created_at,
  };
}

export function toManualEventPatch(patch: Partial<ManualEvent>): ManualEventUpdate {
  const row: ManualEventUpdate = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.startTime !== undefined) row.start_time = patch.startTime;
  if (patch.endTime !== undefined) row.end_time = patch.endTime;
  if (patch.category !== undefined) row.category = patch.category ?? null;
  if (patch.reminderMinutes !== undefined) row.reminder_minutes = patch.reminderMinutes ?? null;
  if (patch.linkedContactIds !== undefined) row.linked_contact_ids = patch.linkedContactIds;
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
