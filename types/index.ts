import type { LineageEntry, RabbiLocation, RabbiWork, SuggestedLink } from "@/lib/torah/rabbiProfile";

export type LifeAreaKey = "faith" | "family" | "knowledge" | "health" | "career";

export interface LifeArea {
  key: LifeAreaKey;
  label: string;
  score: number; // 0-100
  colorVar: string; // css custom property name, e.g. "--accent-faith"
  lastTouched?: string; // ISO date
}

// Hebrew conjugates the second person by gender, so a message to a contact
// cannot be written correctly without knowing it. Optional on purpose: unset
// means the neutral phrasing is used (lib/family/whatsapp.ts), never a guess.
export type PersonGender = "male" | "female";

/** Drives the per-role message templates in lib/family/whatsapp.ts. */
export type PersonRole = "mother" | "father" | "grandfather" | "grandmother" | "friend" | "other";

export interface Person {
  id: string;
  name: string;
  hebrewName?: string;
  relation: string;
  gender?: PersonGender;
  role?: PersonRole;
  /** The user's own wording for this contact's default message. */
  messageTemplate?: string;
  lastMeaningfulInteraction?: string; // ISO date
  birthday?: string; // "MM-DD"
  anniversary?: string; // "MM-DD"
  note?: string;
  phone?: string;
  avatarUrl?: string; // a data: URL (client-side-resized), not a storage path — see the migration for why
}

export type MomentCategory = LifeAreaKey | "general";

export interface Moment {
  id: string;
  timestamp: string; // ISO date
  category: MomentCategory;
  title: string;
  content: string;
  personId?: string; // real link to a Person, when this moment is about someone specific
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  pinnedAt?: string; // ISO datetime; set only once the user pins the message
}

export interface Insight {
  id: string;
  content: string;
  timestamp: string;
}

export interface UserContext {
  name: string;
  hebrewName: string;
  email: string;
  lifeStage: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface KnowledgeEntry {
  id: string;
  date: string; // ISO date
  topic: string;
  source: string;
  summary: string;
  durationMinutes?: number;
  lastReviewedAt?: string; // ISO date; set only once the user marks it reviewed
  flashcards?: Flashcard[]; // populated lazily, see app/api/torah/study-material
  reviewQuestions?: string[];
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  category?: string;
  /** The user's own note. Distinct from `description`, which is provider/AI text. */
  notes?: string;

  // — Smart-hub enrichment (Torah KG Phase 1). Every field optional: a book
  //   typed in by hand with nothing but a title is still a valid book, and
  //   the hub degrades to exactly what it was before rather than showing
  //   empty scaffolding.
  hebrewTitle?: string;
  coverImageUrl?: string;
  publishedYear?: number;
  /** What this sefer is — from Sefaria, or generated. */
  description?: string;
  /** "Important things to know before learning this." */
  preStudyNotes?: string;
  /** Set once the author has been promoted to a full Rabbi entity. */
  authorRabbiId?: string;
  /** Provider payloads, keyed by provider name. */
  externalRefs?: Record<string, unknown>;
  avgPriceIls?: number;
  rating?: number;
  ratingsCount?: number;
  lastSyncedAt?: string;

  // — Book page (Torah KG Phase 2).
  /** Hebrew topic chips — "what is inside". */
  keyTopics?: string[];
  /** The user's own 1–5 verdict, distinct from the provider's `rating`. */
  personalRating?: number;
  personalReview?: string;
  /** Who recommended this sefer. */
  recommendedBy?: string;
  isbn?: string;
}

export interface Rabbi {
  id: string;
  name: string;
  title?: string;
  notes?: string;

  // — Rabbi profile (Torah KG Phases 0 + 2). Every field optional: a rabbi
  //   added by typing a name is a valid rabbi, and the profile degrades to
  //   an elegant empty state plus an "enrich" action.
  hebrewName?: string;
  portraitUrl?: string;
  birthYear?: number;
  deathYear?: number;
  birthPlace?: string;
  deathPlace?: string;
  locations?: RabbiLocation[];
  /** Hebrew era label ("אחרונים"). */
  era?: string;
  /** The story of his life, in Hebrew. */
  bio?: string;
  /** The world he lived in, in Hebrew. */
  historicalContext?: string;
  achievements?: string[];
  /** Teachers and students known about him, in or out of the library. */
  lineage?: LineageEntry[];
  /** His bookshelf, in or out of the library. */
  works?: RabbiWork[];
  isContemporary?: boolean;
  phone?: string;
  whatsappUrl?: string;
  websiteUrl?: string;
  youtubeChannelUrl?: string;
  email?: string;
  /** Links a model proposed; never shown as confirmed contact details. */
  suggestedLinks?: SuggestedLink[];
  externalRefs?: Record<string, unknown>;
  lastSyncedAt?: string;
}

/** A user-defined top-level grouping for summaries (פרשת שבוע, דברי תורה, …). */
/**
 * Everything an @mention can point at.
 *
 * Sections are mentionable but deliberately not *filable*: a summary belongs
 * to a section through `sectionId`, which is a real column, while
 * `entity_type` is constrained by the schema to the four record kinds (see
 * 20260905000000_summaries_rich_text.sql). Modelling that split in the types
 * rather than widening the column keeps the two ways of relating to a section
 * — filed in it, or referred to it — from collapsing into one ambiguous
 * field.
 */
export type EntityType = "book" | "rabbi" | "person" | "topic" | "section";

/** The subset the `entity_type` column accepts. */
export type FiledEntityType = Exclude<EntityType, "section">;

/**
 * A periodic check-in: what the user was doing, and how they felt.
 *
 * A closed activity list rather than free text — the value of a check-in is
 * entirely in the aggregate, and "gym"/"workout"/"training" is one activity
 * to a person and three to a tally.
 */
export type CheckInActivity =
  | "work"
  | "study"
  | "training"
  | "family"
  | "friends"
  | "rest"
  | "errands"
  | "other";

export interface CheckIn {
  id: string;
  /** When the activity happened, not when it was reported. */
  occurredAt: string;
  activity: CheckInActivity;
  /** 1-5. */
  energy: number;
  note?: string;
}

export const CHECK_IN_ACTIVITIES: CheckInActivity[] = [
  "work",
  "study",
  "training",
  "family",
  "friends",
  "rest",
  "errands",
  "other",
];

export const CHECK_IN_ACTIVITY_LABELS: Record<CheckInActivity, string> = {
  work: "עבודה",
  study: "לימודים",
  training: "אימון",
  family: "משפחה",
  friends: "חברים",
  rest: "מנוחה",
  errands: "סידורים",
  other: "אחר",
};

export interface SummarySection {
  id: string;
  name: string;
  /** A lucide icon name from the closed list the picker offers. */
  icon?: string;
  sortOrder: number;
  /** Parent section, for one level of sub-sections. Absent = top level. */
  parentId?: string;
  /** When it was pinned. A timestamp, not a flag, so pins have an order. */
  pinnedAt?: string;
}

/**
 * What a study item is. The table is still called `summaries` — see the
 * migration for why renaming it was not worth breaking every consumer.
 */
export type StudyItemKind = "summary" | "video" | "source" | "audio";

export interface Summary {
  id: string;
  title: string;
  /** Plain text. Kept as the searchable/AI-readable representation. */
  content: string;
  /** The editor's rich representation. Absent on summaries predating it. */
  contentHtml?: string;
  /** Unfinished — powers pause-and-resume. */
  isDraft?: boolean;
  /** The entity this summary is about, if any. */
  entityType?: FiledEntityType;
  entityId?: string;
  /** Entities @mentioned in the body. */
  mentions?: { type: EntityType; id: string; label: string }[];
  /** The section this summary is filed under. Unassigned is valid. */
  sectionId?: string;
  /** Position within its section. */
  sortOrder?: number;
  /** When it was pinned to the top of its section. */
  pinnedAt?: string;
  /** Free-text labels the user typed. */
  tags?: string[];
  /** summary = written note, video = YouTube lesson, source = reference. */
  kind?: StudyItemKind;
  /** The YouTube or reference URL, for video and source items. */
  url?: string;
  date: string; // ISO date
}

export type TaskStatus = "todo" | "in-progress" | "done";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dueDate?: string; // ISO datetime
  isHighPriority: boolean;
  createdAt: string;
}

export type DailyRecommendationIcon = "coffee" | "heart" | "alert-circle" | "calendar-clock";

export interface DailyRecommendation {
  title: string;
  message: string;
  iconName: DailyRecommendationIcon;
}

export interface Habit {
  id: string;
  title: string;
  createdAt: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  completedDate: string; // "YYYY-MM-DD"
}

export type TransactionType = "income" | "expense";

export interface ManualEvent {
  id: string;
  title: string;
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
  category?: MomentCategory;
  reminderMinutes?: number;
  linkedContactIds: string[];
  /** When reminder_sweep fired for this event. Set by the server only; the
   *  presence of a value is what stops a second reminder going out. */
  remindedAt?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  title: string;
  category: string;
  date: string; // "YYYY-MM-DD"
  note?: string;
  // Finances Pro: Work & Shifts — a shift is still a plain income
  // transaction, just with this extra structure. amount is computed
  // client-side (hourlyRate × hours worked) and saved like any other
  // amount, never recomputed server-side.
  isShift: boolean;
  hourlyRate?: number;
  shiftStart?: string; // ISO datetime
  shiftEnd?: string; // ISO datetime
  employer?: string;
  isRecurring: boolean;
  createdAt: string;
}

export type LearningTopicStatus = "planning" | "active" | "completed";

export interface LearningTopic {
  id: string;
  title: string;
  category?: string;
  status: LearningTopicStatus;
  createdAt: string;
}

export type LearningResourceType = "youtube" | "podcast" | "article" | "equipment" | "summary";

export interface LearningResource {
  id: string;
  topicId: string;
  type: LearningResourceType;
  title: string;
  url?: string;
  notes?: string;
  isCompleted: boolean;
  createdAt: string;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "post-workout";

export interface Meal {
  id: string;
  description: string;
  eatenAt: string; // ISO datetime
  type: MealType;
  /** Estimated or entered nutrition. Absent = unknown, never zero. */
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  /** Where the numbers came from — an AI guess must not look like a typed value. */
  macroSource?: MacroSource;
  createdAt: string;
}

export type MacroSource = "ai" | "preset" | "user";
export type WorkoutKind = "strength" | "cardio" | "hiit" | "yoga" | "walk" | "sport" | "other";

export interface Workout {
  id: string;
  title: string;
  startTime: string; // ISO datetime
  endTime?: string; // ISO datetime
  routineDetails?: string;
  kind?: WorkoutKind;
  /** Perceived exertion, 1 (easy) … 5 (all-out). */
  intensity?: number;
  avgHeartRate?: number;
  /** An estimate (MET × weight × time) unless the user entered it. */
  caloriesBurned?: number;
  createdAt: string;
}

/**
 * A proactive notification, as the client renders it.
 *
 * Named AppNotification rather than Notification because the DOM already has
 * a global by that name — a bare `Notification` in a client component would
 * silently resolve to the Web Notifications API instead of this.
 */
export type { RoutineBlock, RoutineKind } from "@/lib/schedule/routine";

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** The "על סמך…" attribution. Every proactive item explains itself. */
  reason?: string;
  /** An Approve/Modify affordance. Never executed without the user tapping. */
  action?: { type: string; payload: Record<string, unknown> };
  status: "pending" | "sent" | "read" | "acted" | "dismissed" | "expired";
  scheduledFor: string;
  readAt?: string;
  createdAt: string;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  date: string; // ISO date
  category: MomentCategory;
  googleEventId?: string; // set when this row is backed by a real Google Calendar event
}

// Coarse windows of the day, the vocabulary the chronotype step speaks in.
// Labels and ordering live in lib/onboarding/chronotype.ts.
export type DayPart = "earlyMorning" | "morning" | "afternoon" | "evening" | "night";

export interface ChronotypeSettings {
  /** "HH:MM", 24h. */
  wakeTime?: string;
  sleepTime?: string;
  peakFocusHours?: DayPart[];
  lowEnergyHours?: DayPart[];
}

export interface PersonalDNA {
  /** What the person asked to be called — not necessarily users.name, which
   *  is whatever Google returned at sign-in. */
  fullName?: string;
  /** "YYYY-MM-DD". */
  birthDate?: string;
  chronotype: ChronotypeSettings;
  /** Ranked life areas, most important first. */
  corePriorities: LifeAreaKey[];
  /** Free-text rendering of chronotype.peakFocusHours, kept in sync by the
   *  wizard because the AI signal pipeline and two UI surfaces still read the
   *  original column. See summarizePeakFocus(). */
  peakFocusHours?: string;
  learningStyle?: string;
  familyCheckInIntervalDays?: number;
  habitNotes: string[];
  sleepNotes?: string;
  careerNotes?: string;
  motivationTriggers: string[];
  /** IANA zone, e.g. "Asia/Jerusalem". Inferred from the browser on first
   *  load and overridable in settings. Drives every user-local decision the
   *  Proactive Engine makes — what "07:00" and "today" mean for this person. */
  timezone?: string;
}

export const EMPTY_PERSONAL_DNA: PersonalDNA = {
  chronotype: {},
  corePriorities: [],
  habitNotes: [],
  motivationTriggers: [],
};

// The legacy one-question-at-a-time fallback only drives the free-text
// fields; the structured ones (chronotype, priorities) are the wizard's job.
export type OnboardingTextField = Extract<
  keyof PersonalDNA,
  "peakFocusHours" | "learningStyle" | "familyCheckInIntervalDays" | "sleepNotes" | "careerNotes"
>;

export interface OnboardingQuestion {
  id: OnboardingTextField;
  prompt: string;
}

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  completedAt?: string; // ISO date; set only going forward (see migration 20260720000003)
  dueDate?: string; // ISO date; spread across a goal's targetDate, see lib/goals/distributeMilestoneDates.ts
}

export interface Goal {
  id: string;
  title: string;
  category: LifeAreaKey;
  createdAt: string; // ISO date
  targetDate?: string; // ISO date
  personId?: string; // real link to a Person, when this goal is about a specific relationship
  milestones: Milestone[];
}

export interface FreeSlot {
  start: string; // ISO datetime
  end: string; // ISO datetime
}

export interface SuggestedAction {
  id: string;
  title: string;
  category: MomentCategory;
  start: string; // ISO datetime
  end: string; // ISO datetime
  rationale: string;
  confidence: number; // 0..1, see lib/suggestionConfidence.ts
}
