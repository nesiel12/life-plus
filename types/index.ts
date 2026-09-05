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
  notes?: string;
}

export interface Rabbi {
  id: string;
  name: string;
  title?: string;
  notes?: string;
}

/** A user-defined top-level grouping for summaries (פרשת שבוע, דברי תורה, …). */
export interface SummarySection {
  id: string;
  name: string;
  /** A lucide icon name from the closed list the picker offers. */
  icon?: string;
  sortOrder: number;
}

/**
 * What a study item is. The table is still called `summaries` — see the
 * migration for why renaming it was not worth breaking every consumer.
 */
export type StudyItemKind = "summary" | "video" | "source";

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
  entityType?: "book" | "rabbi" | "person" | "topic";
  entityId?: string;
  /** Entities @mentioned in the body. */
  mentions?: { type: "book" | "rabbi" | "person" | "topic"; id: string; label: string }[];
  /** The section this summary is filed under. Unassigned is valid. */
  sectionId?: string;
  /** Position within its section. */
  sortOrder?: number;
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
  createdAt: string;
}

export interface Workout {
  id: string;
  title: string;
  startTime: string; // ISO datetime
  endTime?: string; // ISO datetime
  routineDetails?: string;
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
