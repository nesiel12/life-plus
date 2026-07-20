import { create } from "zustand";
import { momentCategoryLabel } from "@/lib/lifeAreas";
import { addMomentAction } from "@/app/actions/moments";
import { logPersonInteractionAction, setPersonBirthdayAction } from "@/app/actions/people";
import { addChatMessageAction } from "@/app/actions/chat";
import { addInsightAction } from "@/app/actions/insights";
import { addKnowledgeEntryAction } from "@/app/actions/knowledge";
import { updateLifeAreaScoreAction } from "@/app/actions/lifeAreas";
import { updatePersonalDNAAction, completeOnboardingAction } from "@/app/actions/personalDna";
import { addGoalAction, toggleMilestoneAction, removeGoalAction } from "@/app/actions/goals";
import { addUpcomingEventAction } from "@/app/actions/upcomingEvents";
import { setTodayIntentionAction } from "@/app/actions/dailyIntention";
import type {
  ChatMessage,
  Goal,
  Insight,
  KnowledgeEntry,
  LifeArea,
  Moment,
  MomentCategory,
  PersonalDNA,
  Person,
  SuggestedAction,
  UpcomingEvent,
  UserContext,
} from "@/types";

// Everything hydrate() accepts — the shape getInitialState() (app/actions/
// bootstrap.ts) returns. Real data now; see docs/ROADMAP_V2.md Phase 1.
export interface HydratedState {
  user: UserContext;
  lifeAreas: LifeArea[];
  people: Person[];
  moments: Moment[];
  upcomingEvents: UpcomingEvent[];
  knowledgeEntries: KnowledgeEntry[];
  chatHistory: ChatMessage[];
  insights: Insight[];
  personalDNA: PersonalDNA;
  onboardingComplete: boolean;
  goals: Goal[];
  todayIntention: string;
}

interface AtlasState extends HydratedState {
  hydrated: boolean;
  suggestedActions: SuggestedAction[];

  hydrate: (state: HydratedState) => void;

  setTodayIntention: (intention: string) => Promise<void>;
  addMoment: (moment: { category: MomentCategory; title: string; content: string }) => Promise<void>;
  logPersonInteraction: (personId: string, note?: string) => Promise<void>;
  setPersonBirthday: (personId: string, birthday: string) => Promise<void>;
  addChatMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => Promise<void>;
  addInsight: (content: string) => Promise<void>;
  addKnowledgeEntry: (entry: Omit<KnowledgeEntry, "id">) => Promise<void>;
  updateLifeAreaScore: (key: LifeArea["key"], score: number) => Promise<void>;

  updatePersonalDNA: (patch: Partial<PersonalDNA>) => Promise<void>;
  completeOnboarding: () => Promise<void>;

  addGoal: (title: string, category: Goal["category"], milestoneTitles: string[]) => Promise<void>;
  toggleMilestone: (goalId: string, milestoneId: string) => Promise<void>;
  removeGoal: (goalId: string) => Promise<void>;

  setSuggestedActions: (actions: SuggestedAction[]) => void;
  acceptSuggestion: (id: string) => Promise<void>;
  dismissSuggestion: (id: string) => void;
}

const EMPTY_STATE: HydratedState = {
  user: { name: "", hebrewName: "", email: "", lifeStage: "" },
  lifeAreas: [],
  people: [],
  moments: [],
  upcomingEvents: [],
  knowledgeEntries: [],
  chatHistory: [],
  insights: [],
  personalDNA: { habitNotes: [] },
  onboardingComplete: false,
  goals: [],
  todayIntention: "",
};

export const useAtlasStore = create<AtlasState>((set, get) => ({
  ...EMPTY_STATE,
  hydrated: false,
  suggestedActions: [],

  hydrate: (state) => set({ ...state, hydrated: true }),

  setTodayIntention: async (intention) => {
    set({ todayIntention: intention });
    await setTodayIntentionAction(intention);
  },

  addMoment: async (moment) => {
    const created = await addMomentAction(moment);
    set((state) => ({ moments: [created, ...state.moments] }));
  },

  logPersonInteraction: async (personId, note) => {
    const updated = await logPersonInteractionAction(personId, note);
    set((state) => ({
      people: state.people.map((p) => (p.id === personId ? updated : p)),
    }));
  },

  setPersonBirthday: async (personId, birthday) => {
    const updated = await setPersonBirthdayAction(personId, birthday);
    set((state) => ({
      people: state.people.map((p) => (p.id === personId ? updated : p)),
    }));
  },

  addChatMessage: async (message) => {
    const created = await addChatMessageAction(message.role, message.content);
    set((state) => ({ chatHistory: [...state.chatHistory, created] }));
  },

  addInsight: async (content) => {
    const created = await addInsightAction(content);
    set((state) => ({ insights: [created, ...state.insights] }));
  },

  addKnowledgeEntry: async (entry) => {
    const created = await addKnowledgeEntryAction(entry);
    set((state) => ({ knowledgeEntries: [created, ...state.knowledgeEntries] }));
  },

  updateLifeAreaScore: async (key, score) => {
    const updated = await updateLifeAreaScoreAction(key, score);
    set((state) => ({
      lifeAreas: state.lifeAreas.map((a) => (a.key === key ? updated : a)),
    }));
  },

  updatePersonalDNA: async (patch) => {
    const updated = await updatePersonalDNAAction(patch);
    set({ personalDNA: updated });
  },

  completeOnboarding: async () => {
    set({ onboardingComplete: true });
    await completeOnboardingAction();
  },

  addGoal: async (title, category, milestoneTitles) => {
    const created = await addGoalAction(title, category, milestoneTitles);
    set((state) => ({ goals: [created, ...state.goals] }));
  },

  toggleMilestone: async (goalId, milestoneId) => {
    set((state) => ({
      goals: state.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              milestones: g.milestones.map((m) =>
                m.id === milestoneId ? { ...m, done: !m.done } : m
              ),
            }
          : g
      ),
    }));
    await toggleMilestoneAction(goalId, milestoneId);
  },

  removeGoal: async (goalId) => {
    set((state) => ({ goals: state.goals.filter((g) => g.id !== goalId) }));
    await removeGoalAction(goalId);
  },

  setSuggestedActions: (actions) => set({ suggestedActions: actions }),

  // Deliberately does NOT optimistically remove the suggestion up front:
  // "accept" now means a real Google Calendar event gets created (see
  // app/api/calendar/events), and if that write fails the suggestion should
  // stay put so the user can retry, rather than silently vanishing while
  // nothing landed on their actual calendar (docs/BACKLOG.md).
  acceptSuggestion: async (id) => {
    const accepted = get().suggestedActions.find((s) => s.id === id);
    if (!accepted) return;

    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: accepted.title, start: accepted.start, end: accepted.end }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "לא הצלחנו ליצור את האירוע ביומן Google.");
    }
    const { id: googleEventId } = (await res.json()) as { id: string };

    const created = await addUpcomingEventAction({
      title: accepted.title,
      date: accepted.start,
      category: accepted.category,
      googleEventId,
    });

    set((state) => ({
      suggestedActions: state.suggestedActions.filter((s) => s.id !== id),
      upcomingEvents: [created, ...state.upcomingEvents],
    }));
  },

  dismissSuggestion: (id) =>
    set((state) => ({
      suggestedActions: state.suggestedActions.filter((s) => s.id !== id),
    })),
}));

// Re-exported for backward compatibility with existing call sites; the
// canonical mapping lives in lib/lifeAreas.ts (see docs/TECH_DEBT.md #11).
export const categoryLabel = momentCategoryLabel;
