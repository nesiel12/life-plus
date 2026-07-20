import { create } from "zustand";
import { LIFE_AREAS, momentCategoryLabel } from "@/lib/lifeAreas";
import type {
  ChatMessage,
  Goal,
  Insight,
  KnowledgeEntry,
  LifeArea,
  Moment,
  PersonalDNA,
  Person,
  SuggestedAction,
  UpcomingEvent,
  UserContext,
} from "@/types";

interface AtlasState {
  user: UserContext;
  lifeAreas: LifeArea[];
  people: Person[];
  moments: Moment[];
  upcomingEvents: UpcomingEvent[];
  knowledgeEntries: KnowledgeEntry[];
  chatHistory: ChatMessage[];
  insights: Insight[];
  todayIntention: string;
  personalDNA: PersonalDNA;
  onboardingComplete: boolean;
  goals: Goal[];
  suggestedActions: SuggestedAction[];

  setTodayIntention: (intention: string) => void;
  addMoment: (moment: Omit<Moment, "id" | "timestamp"> & { timestamp?: string }) => void;
  logPersonInteraction: (personId: string, note?: string) => void;
  setPersonBirthday: (personId: string, birthday: string) => void;
  addChatMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  addInsight: (content: string) => void;
  addKnowledgeEntry: (entry: Omit<KnowledgeEntry, "id">) => void;
  updateLifeAreaScore: (key: LifeArea["key"], score: number) => void;

  updatePersonalDNA: (patch: Partial<PersonalDNA>) => void;
  completeOnboarding: () => void;

  addGoal: (title: string, category: Goal["category"], milestoneTitles: string[]) => void;
  toggleMilestone: (goalId: string, milestoneId: string) => void;
  removeGoal: (goalId: string) => void;

  setSuggestedActions: (actions: SuggestedAction[]) => void;
  acceptSuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => void;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const INITIAL_SCORES: Record<LifeArea["key"], { score: number; lastTouched: string }> = {
  faith: { score: 78, lastTouched: "2026-07-19" },
  family: { score: 82, lastTouched: "2026-07-18" },
  knowledge: { score: 70, lastTouched: "2026-07-17" },
  health: { score: 60, lastTouched: "2026-07-15" },
  career: { score: 65, lastTouched: "2026-07-16" },
};

const initialLifeAreas: LifeArea[] = Object.values(LIFE_AREAS).map((meta) => ({
  key: meta.key,
  label: meta.label,
  colorVar: meta.colorVar,
  ...INITIAL_SCORES[meta.key],
}));

const initialPeople: Person[] = [
  {
    id: "hedva",
    name: "Hedva",
    hebrewName: "חדוה",
    relation: "אמא",
    lastMeaningfulInteraction: "2026-07-14",
  },
  {
    id: "oded",
    name: "Oded",
    hebrewName: "עודד",
    relation: "אבא",
    lastMeaningfulInteraction: "2026-07-14",
  },
  {
    id: "elyasaf",
    name: "Elyasaf",
    hebrewName: "אליסף",
    relation: "אח/אחות",
    lastMeaningfulInteraction: "2026-07-12",
  },
  {
    id: "anael",
    name: "Anael",
    hebrewName: "ענאל",
    relation: "אח/אחות",
    lastMeaningfulInteraction: "2026-07-10",
  },
  {
    id: "adir-michael",
    name: "Adir Michael",
    hebrewName: "אדיר מיכאל",
    relation: "אח/אחות",
    lastMeaningfulInteraction: "2026-07-09",
  },
  {
    id: "odaya",
    name: "Odaya",
    hebrewName: "אודיה",
    relation: "אח/אחות",
    lastMeaningfulInteraction: "2026-07-08",
  },
  {
    id: "roniya",
    name: "Roniya",
    hebrewName: "רוניה",
    relation: "אח/אחות",
    lastMeaningfulInteraction: "2026-07-08",
  },
  {
    id: "young-cousin",
    name: "Young Cousin",
    hebrewName: "בן דוד צעיר",
    relation: "משפחה מורחבת",
    lastMeaningfulInteraction: "2026-07-05",
  },
];

const initialMoments: Moment[] = [
  {
    id: makeId(),
    timestamp: "2026-07-19T06:30:00",
    category: "faith",
    title: "סדר בוקר",
    content: "למדתי פרק בגמרא לפני התורנות היום, הרגשתי מחובר ורגוע.",
  },
  {
    id: makeId(),
    timestamp: "2026-07-18T20:15:00",
    category: "family",
    title: "שיחה עם חדוה ועודד",
    content: "התעדכנו איך עובר השבוע, שיחה חמה ורגועה.",
  },
  {
    id: makeId(),
    timestamp: "2026-07-17T21:00:00",
    category: "knowledge",
    title: "פרויקט פייתון",
    content: "התחלתי לבנות סוכן AI קטן לניהול לוז יומי.",
  },
];

const initialUpcomingEvents: UpcomingEvent[] = [
  {
    id: makeId(),
    title: "להתקשר לחדוה ולעודד",
    date: "2026-07-21",
    category: "family",
  },
];

const initialKnowledgeEntries: KnowledgeEntry[] = [
  {
    id: makeId(),
    date: "2026-07-19",
    topic: "הלכות שבת",
    source: "משנה ברורה",
    summary: "סקירה של דיני הוצאה מרשות לרשות.",
    durationMinutes: 40,
  },
];

export const useAtlasStore = create<AtlasState>((set) => ({
  user: {
    name: "Nesiel",
    hebrewName: "נסיאל",
    email: "nesiel12388@gmail.com",
    lifeStage: "בונה את אטלס ומנהל דרכו את החיים האישיים",
  },
  lifeAreas: initialLifeAreas,
  people: initialPeople,
  moments: initialMoments,
  upcomingEvents: initialUpcomingEvents,
  knowledgeEntries: initialKnowledgeEntries,
  chatHistory: [],
  insights: [
    {
      id: makeId(),
      content: "שמת לב שברוב הימים שבהם אתה לומד סדר בוקר, גם השיחה עם המשפחה יוצאת יותר טובה.",
      timestamp: "2026-07-19T07:00:00",
    },
  ],
  todayIntention: "",
  personalDNA: {
    habitNotes: [],
  },
  onboardingComplete: false,
  goals: [],
  suggestedActions: [],

  setTodayIntention: (intention) => set({ todayIntention: intention }),

  addMoment: (moment) =>
    set((state) => ({
      moments: [
        { ...moment, id: makeId(), timestamp: moment.timestamp ?? new Date().toISOString() },
        ...state.moments,
      ],
    })),

  logPersonInteraction: (personId, note) =>
    set((state) => ({
      people: state.people.map((p) =>
        p.id === personId
          ? { ...p, lastMeaningfulInteraction: new Date().toISOString(), note: note ?? p.note }
          : p
      ),
    })),

  setPersonBirthday: (personId, birthday) =>
    set((state) => ({
      people: state.people.map((p) => (p.id === personId ? { ...p, birthday } : p)),
    })),

  addChatMessage: (message) =>
    set((state) => ({
      chatHistory: [
        ...state.chatHistory,
        { ...message, id: makeId(), timestamp: new Date().toISOString() },
      ],
    })),

  addInsight: (content) =>
    set((state) => ({
      insights: [{ id: makeId(), content, timestamp: new Date().toISOString() }, ...state.insights],
    })),

  addKnowledgeEntry: (entry) =>
    set((state) => ({
      knowledgeEntries: [{ ...entry, id: makeId() }, ...state.knowledgeEntries],
    })),

  updateLifeAreaScore: (key, score) =>
    set((state) => ({
      lifeAreas: state.lifeAreas.map((a) => (a.key === key ? { ...a, score } : a)),
    })),

  updatePersonalDNA: (patch) =>
    set((state) => ({ personalDNA: { ...state.personalDNA, ...patch } })),

  completeOnboarding: () => set({ onboardingComplete: true }),

  addGoal: (title, category, milestoneTitles) =>
    set((state) => ({
      goals: [
        {
          id: makeId(),
          title,
          category,
          createdAt: new Date().toISOString(),
          milestones: milestoneTitles.map((m) => ({ id: makeId(), title: m, done: false })),
        },
        ...state.goals,
      ],
    })),

  toggleMilestone: (goalId, milestoneId) =>
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
    })),

  removeGoal: (goalId) =>
    set((state) => ({ goals: state.goals.filter((g) => g.id !== goalId) })),

  setSuggestedActions: (actions) => set({ suggestedActions: actions }),

  acceptSuggestion: (id) =>
    set((state) => {
      const suggestion = state.suggestedActions.find((s) => s.id === id);
      if (!suggestion) return state;
      return {
        suggestedActions: state.suggestedActions.filter((s) => s.id !== id),
        upcomingEvents: [
          {
            id: makeId(),
            title: suggestion.title,
            date: suggestion.start,
            category: suggestion.category,
          },
          ...state.upcomingEvents,
        ],
      };
    }),

  dismissSuggestion: (id) =>
    set((state) => ({
      suggestedActions: state.suggestedActions.filter((s) => s.id !== id),
    })),
}));

// Re-exported for backward compatibility with existing call sites; the
// canonical mapping lives in lib/lifeAreas.ts (see docs/TECH_DEBT.md #11).
export const categoryLabel = momentCategoryLabel;
