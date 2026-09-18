// Pure functions mapping Postgres rows (snake_case, per types/database.ts)
// onto the app's existing shapes (camelCase, per types/index.ts) — kept in
// one place so the store/components never need to know the DB's column
// naming, and so a schema column rename only ever touches this file.
import { LIFE_AREAS, LIFE_AREA_LIST } from "@/lib/lifeAreas";
import { isDayPart } from "@/lib/onboarding/chronotype";
import type { Database, Json } from "@/types/database";
import type {
  AppNotification,
  Book,
  RoutineBlock,
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
  SummarySection,
  Task,
  Transaction,
  UpcomingEvent,
  UserContext,
  Workout,
  CheckIn,
} from "@/types";
import type { GoalWithMilestones } from "@/lib/db/goals";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type RoutineBlockRow = Database["public"]["Tables"]["routine_blocks"]["Row"];
type RoutineBlockUpdate = Database["public"]["Tables"]["routine_blocks"]["Update"];
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
type SummarySectionRow = Database["public"]["Tables"]["summary_sections"]["Row"];
type CheckInRow = Database["public"]["Tables"]["check_ins"]["Row"];
type SummarySectionUpdate = Database["public"]["Tables"]["summary_sections"]["Update"];
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
    timezone: row?.timezone ?? undefined,
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
  if (patch.timezone !== undefined) row.timezone = patch.timezone || null;
  return row;
}

export function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? undefined,
    category: row.category ?? undefined,
    notes: row.notes ?? undefined,
    hebrewTitle: row.hebrew_title ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    publishedYear: row.published_year ?? undefined,
    description: row.description ?? undefined,
    preStudyNotes: row.pre_study_notes ?? undefined,
    authorRabbiId: row.author_rabbi_id ?? undefined,
    externalRefs: (row.external_refs as Record<string, unknown> | null) ?? undefined,
    // numeric columns arrive as strings from some Postgres drivers; Number()
    // on an already-numeric value is a no-op, and on null would be 0 — hence
    // the explicit null check rather than a bare Number(row.x) || undefined,
    // which would also swallow a legitimate 0.
    avgPriceIls: row.avg_price_ils === null ? undefined : Number(row.avg_price_ils),
    rating: row.rating === null ? undefined : Number(row.rating),
    ratingsCount: row.ratings_count ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    keyTopics: stringArray(row.key_topics),
    personalRating: row.personal_rating ?? undefined,
    personalReview: row.personal_review ?? undefined,
    recommendedBy: row.recommended_by ?? undefined,
    isbn: row.isbn ?? undefined,
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
  if (patch.hebrewTitle !== undefined) row.hebrew_title = patch.hebrewTitle || null;
  if (patch.coverImageUrl !== undefined) row.cover_image_url = patch.coverImageUrl || null;
  if (patch.publishedYear !== undefined) row.published_year = patch.publishedYear ?? null;
  if (patch.description !== undefined) row.description = patch.description || null;
  if (patch.preStudyNotes !== undefined) row.pre_study_notes = patch.preStudyNotes || null;
  if (patch.authorRabbiId !== undefined) row.author_rabbi_id = patch.authorRabbiId || null;
  if (patch.externalRefs !== undefined) row.external_refs = patch.externalRefs as Json;
  if (patch.avgPriceIls !== undefined) row.avg_price_ils = patch.avgPriceIls ?? null;
  if (patch.rating !== undefined) row.rating = patch.rating ?? null;
  if (patch.ratingsCount !== undefined) row.ratings_count = patch.ratingsCount ?? null;
  if (patch.lastSyncedAt !== undefined) row.last_synced_at = patch.lastSyncedAt || null;
  if (patch.keyTopics !== undefined) row.key_topics = patch.keyTopics as Json;
  if (patch.personalRating !== undefined) row.personal_rating = patch.personalRating ?? null;
  if (patch.personalReview !== undefined) row.personal_review = patch.personalReview || null;
  if (patch.recommendedBy !== undefined) row.recommended_by = patch.recommendedBy || null;
  if (patch.isbn !== undefined) row.isbn = patch.isbn || null;
  return row;
}

export function toRabbi(row: RabbiRow): Rabbi {
  return {
    id: row.id,
    name: row.name,
    title: row.title ?? undefined,
    notes: row.notes ?? undefined,
    hebrewName: row.hebrew_name ?? undefined,
    portraitUrl: row.portrait_url ?? undefined,
    birthYear: row.birth_year ?? undefined,
    deathYear: row.death_year ?? undefined,
    birthPlace: row.birth_place ?? undefined,
    deathPlace: row.death_place ?? undefined,
    locations: jsonArray<NonNullable<Rabbi["locations"]>[number]>(row.locations),
    era: row.era ?? undefined,
    bio: row.bio ?? undefined,
    historicalContext: row.historical_context ?? undefined,
    achievements: stringArray(row.achievements),
    lineage: jsonArray<NonNullable<Rabbi["lineage"]>[number]>(row.lineage),
    works: jsonArray<NonNullable<Rabbi["works"]>[number]>(row.works),
    isContemporary: row.is_contemporary ?? undefined,
    phone: row.phone ?? undefined,
    whatsappUrl: row.whatsapp_url ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    youtubeChannelUrl: row.youtube_channel_url ?? undefined,
    email: row.email ?? undefined,
    suggestedLinks: jsonArray<NonNullable<Rabbi["suggestedLinks"]>[number]>(row.suggested_links),
    externalRefs: (row.external_refs as Record<string, unknown> | null) ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
  };
}

export function toRabbiPatch(patch: Partial<Rabbi>): RabbiUpdate {
  const row: RabbiUpdate = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.title !== undefined) row.title = patch.title || null;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  if (patch.hebrewName !== undefined) row.hebrew_name = patch.hebrewName || null;
  if (patch.portraitUrl !== undefined) row.portrait_url = patch.portraitUrl || null;
  if (patch.birthYear !== undefined) row.birth_year = patch.birthYear ?? null;
  if (patch.deathYear !== undefined) row.death_year = patch.deathYear ?? null;
  if (patch.birthPlace !== undefined) row.birth_place = patch.birthPlace || null;
  if (patch.deathPlace !== undefined) row.death_place = patch.deathPlace || null;
  if (patch.locations !== undefined) row.locations = patch.locations as unknown as Json;
  if (patch.era !== undefined) row.era = patch.era || null;
  if (patch.bio !== undefined) row.bio = patch.bio || null;
  if (patch.historicalContext !== undefined) row.historical_context = patch.historicalContext || null;
  if (patch.achievements !== undefined) row.achievements = patch.achievements as Json;
  if (patch.lineage !== undefined) row.lineage = patch.lineage as unknown as Json;
  if (patch.works !== undefined) row.works = patch.works as unknown as Json;
  if (patch.isContemporary !== undefined) row.is_contemporary = patch.isContemporary ?? null;
  // Contact columns are user-asserted: an empty string clears one.
  if (patch.phone !== undefined) row.phone = patch.phone || null;
  if (patch.whatsappUrl !== undefined) row.whatsapp_url = patch.whatsappUrl || null;
  if (patch.websiteUrl !== undefined) row.website_url = patch.websiteUrl || null;
  if (patch.youtubeChannelUrl !== undefined) row.youtube_channel_url = patch.youtubeChannelUrl || null;
  if (patch.email !== undefined) row.email = patch.email || null;
  if (patch.suggestedLinks !== undefined) row.suggested_links = patch.suggestedLinks as unknown as Json;
  if (patch.externalRefs !== undefined) row.external_refs = patch.externalRefs as Json;
  if (patch.lastSyncedAt !== undefined) row.last_synced_at = patch.lastSyncedAt || null;
  return row;
}

/** A jsonb array column as a typed array; anything malformed reads as empty. */
function jsonArray<T>(value: Json | null | undefined): T[] {
  return Array.isArray(value) ? (value as unknown as T[]) : [];
}

/** A jsonb string-array column, dropping anything that is not a non-blank string. */
function stringArray(value: Json | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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
    sectionId: row.section_id ?? undefined,
    sortOrder: row.sort_order ?? 0,
    pinnedAt: row.pinned_at ?? undefined,
    tags: (row.tags as string[]) ?? [],
    kind: (row.kind as Summary["kind"]) ?? "summary",
    url: row.url ?? undefined,
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
  if (patch.sectionId !== undefined) row.section_id = patch.sectionId || null;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  // `?? null`, not `|| null`: unpinning writes null on purpose.
  if (patch.pinnedAt !== undefined) row.pinned_at = patch.pinnedAt ?? null;
  if (patch.tags !== undefined) row.tags = patch.tags as Json;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.url !== undefined) row.url = patch.url || null;
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
    // Read-only on the client: only reminder_sweep writes it, and it does so
    // with a conditional UPDATE that is the feature's idempotency guarantee.
    // Deliberately absent from toManualEventPatch for the same reason.
    remindedAt: row.reminded_at ?? undefined,
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

export function toSummarySection(row: SummarySectionRow): SummarySection {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon ?? undefined,
    sortOrder: row.sort_order,
    parentId: row.parent_id ?? undefined,
    pinnedAt: row.pinned_at ?? undefined,
  };
}

export function toSummarySectionPatch(patch: Partial<SummarySection>): SummarySectionUpdate {
  const row: SummarySectionUpdate = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.icon !== undefined) row.icon = patch.icon || null;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  // `?? null` rather than `|| null`: these are nullable by design, and
  // unpinning or promoting to top level means writing null deliberately.
  if (patch.parentId !== undefined) row.parent_id = patch.parentId ?? null;
  if (patch.pinnedAt !== undefined) row.pinned_at = patch.pinnedAt ?? null;
  return row;
}

export function toCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    // The column is CHECK-constrained to this union, but the row type is
    // `string` — the cast is the one place those two facts meet.
    activity: row.activity as CheckIn["activity"],
    energy: row.energy,
    note: row.note ?? undefined,
  };
}

export function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    reason: row.reason ?? undefined,
    // `action` is jsonb, so the row type is an open record. The shape is
    // written by lib/proactive only (never by a client), and the renderer
    // treats an unknown `type` as "no affordance" rather than trusting it.
    action: row.action
      ? (row.action as unknown as { type: string; payload: Record<string, unknown> })
      : undefined,
    status: row.status,
    scheduledFor: row.scheduled_for,
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  };
}

export function toRoutineBlock(row: RoutineBlockRow): RoutineBlock {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    // Postgres smallint[] arrives as numbers; the engine treats Sunday as 0
    // to match Date.getDay(), which is the same convention the column uses.
    weekdays: row.weekdays ?? [],
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    note: row.note ?? undefined,
    isActive: row.is_active,
  };
}

export function toRoutineBlockPatch(patch: Partial<RoutineBlock>): RoutineBlockUpdate {
  const row: RoutineBlockUpdate = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.weekdays !== undefined) row.weekdays = patch.weekdays;
  if (patch.startMinute !== undefined) row.start_minute = patch.startMinute;
  if (patch.endMinute !== undefined) row.end_minute = patch.endMinute;
  if (patch.note !== undefined) row.note = patch.note || null;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  return row;
}
