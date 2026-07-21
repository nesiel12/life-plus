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
  note?: string;
}

export type MomentCategory = LifeAreaKey | "general";

export interface Moment {
  id: string;
  timestamp: string; // ISO date
  category: MomentCategory;
  title: string;
  content: string;
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
}

export interface Goal {
  id: string;
  title: string;
  category: LifeAreaKey;
  createdAt: string; // ISO date
  targetDate?: string; // ISO date
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
