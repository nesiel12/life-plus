export type LifeAreaKey = "faith" | "family" | "knowledge" | "health" | "career";

export interface LifeArea {
  key: LifeAreaKey;
  label: string;
  score: number; // 0-100
  colorVar: string; // css custom property name, e.g. "--accent-faith"
  lastTouched?: string; // ISO date
}

export interface Person {
  id: string;
  name: string;
  hebrewName?: string;
  relation: string;
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

export interface PersonalDNA {
  peakFocusHours?: string;
  learningStyle?: string;
  familyCheckInIntervalDays?: number;
  habitNotes: string[];
  sleepNotes?: string;
  careerNotes?: string;
  motivationTriggers: string[];
}

export interface OnboardingQuestion {
  id: keyof PersonalDNA;
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
