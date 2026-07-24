import "server-only";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { goalsRepo } from "@/lib/db/goals";
import { lifeAreaScoresRepo } from "@/lib/db/lifeAreaScores";
import { upcomingEventsRepo } from "@/lib/db/upcomingEvents";
import { peopleRepo } from "@/lib/db/people";
import { toGoal, toLifeArea, toUpcomingEvent, toPerson } from "@/lib/mappers";
import { retrieveRelevantMemory } from "@/lib/memory/retrieveMemory";
import { getPersonalPatternDescriptions } from "@/lib/intelligence/personalDNA";
import { getRecommendationInsights } from "@/lib/intelligence/recommendations";
import { isPersonStale } from "@/lib/family/deriveRelationshipHealth";
import { BIRTHDAY_WINDOW_DAYS } from "@/lib/family/pickSuggestedAction";
import { daysSince, daysUntilNextAnnualDate } from "@/lib/utils";
import type { AtlasContext, BuildContextOptions } from "@/lib/context/types";

const DEFAULT_STALE_THRESHOLD_DAYS = 7;
const MAX_UPCOMING_EVENTS = 5;
const MAX_PERSONAL_PATTERNS = 5;
const MAX_RECOMMENDATION_INSIGHTS = 3;

// The Context Engine (docs/ATLAS_ARCHITECTURE_VISION.md §5): the one place
// that assembles "what does Atlas actually know that's relevant right now."
// Before this, every AI-backed route grew its own ad-hoc context assembly —
// chat fetched personalDNA+memory inline, calendar suggestions trusted
// whatever life-area scores the client happened to send, goal breakdown and
// Torah extraction fetched no user context at all. Every route now calls
// this instead of re-implementing "go fetch the user's stuff."
export async function buildAtlasContext(
  userId: string,
  options: BuildContextOptions = {}
): Promise<AtlasContext> {
  const [
    personalDNA,
    goalRows,
    lifeAreaRows,
    upcomingEventRows,
    peopleRows,
    relevantMemory,
    personalPatterns,
    recommendationInsights,
  ] = await Promise.all([
    personalDnaRepo.get(userId),
    goalsRepo.listWithMilestones(userId),
    lifeAreaScoresRepo.list(userId),
    upcomingEventsRepo.list(userId),
    peopleRepo.list(userId),
    options.query ? retrieveRelevantMemory(userId, options.query, options.memoryLimit) : Promise.resolve([]),
    getPersonalPatternDescriptions(userId, MAX_PERSONAL_PATTERNS),
    getRecommendationInsights(userId, MAX_RECOMMENDATION_INSIGHTS),
  ]);

  // Same rule the family page uses for its own stale-contact threshold
  // (docs/BACKLOG.md) — kept identical here rather than reinvented, so
  // "Atlas thinks you're overdue to reach out" always means the same thing
  // everywhere it's said.
  const staleThresholdDays = personalDNA?.family_check_in_interval_days ?? DEFAULT_STALE_THRESHOLD_DAYS;
  const people = peopleRows.map(toPerson);

  return {
    personalDNA,
    activeGoals: goalRows.map(toGoal).map((goal) => {
      const done = goal.milestones.filter((m) => m.done).length;
      const progress = goal.milestones.length ? Math.round((done / goal.milestones.length) * 100) : 0;
      // A goal's own target date (e.g. a wedding date set as a goal's
      // deadline) previously never reached the AI at all — activeGoals
      // dropped it, and it isn't a row in upcoming_events either. Surfacing
      // it here is what lets Atlas actually know about a dated commitment
      // like this instead of only its progress percentage.
      const dateNote = goal.targetDate ? ` (תאריך יעד: ${goal.targetDate})` : "";
      return `${goal.title} — ${progress}% הושלם${dateNote}`;
    }),
    lifeAreas: lifeAreaRows.map(toLifeArea),
    upcomingEvents: upcomingEventRows
      .map(toUpcomingEvent)
      .slice(0, MAX_UPCOMING_EVENTS)
      .map((event) => `${event.title} (${event.date})`),
    relevantMemory,
    // Proactive CRM Actions (docs/ATLAS_ARCHITECTURE_VISION.md §13): two
    // real, independent reasons a person can surface here — a stale
    // relationship (unchanged from before) and now also a real approaching
    // birthday, using the exact person data already fetched for this
    // request. Deliberately not a full pickSuggestedAction() call: that
    // needs interaction-trend/moments data this context doesn't fetch (and
    // buildAtlasContext is called by every AI route, so adding a per-person
    // moments query here would be a real, broad cost) — isPersonStale alone
    // is already the identical condition pickSuggestedAction's own
    // "needs_attention" branch checks, so reusing it is honest, not a
    // shortcut.
    // Unconditional roster (name + how they're related), distinct from
    // relationshipSignals below — this is what lets lib/chatSystemPrompt.ts
    // name real people dynamically instead of a hardcoded, drifting list
    // (it previously named a fixed set of family members from memory, which
    // silently went stale the moment a new person — e.g. a partner — was
    // added via the Family page and never updated here).
    peopleRoster: people.map((person) => `${person.hebrewName ?? person.name} (${person.relation})`),
    relationshipSignals: people
      .flatMap((person) => {
        const displayName = person.hebrewName ?? person.name;
        const signals: string[] = [];

        const since = person.lastMeaningfulInteraction ? daysSince(person.lastMeaningfulInteraction) : null;
        if (isPersonStale(since, staleThresholdDays)) {
          signals.push(`לא יצרת קשר עם ${displayName} כבר ${since} ימים — כדאי להתקשר.`);
        }

        const untilBirthday = person.birthday ? daysUntilNextAnnualDate(person.birthday) : null;
        if (untilBirthday !== null && untilBirthday >= 0 && untilBirthday <= BIRTHDAY_WINDOW_DAYS) {
          signals.push(
            untilBirthday === 0
              ? `היום יום ההולדת של ${displayName} — אולי כדאי לקנות מתנה.`
              : `יום ההולדת של ${displayName} בעוד ${untilBirthday} ימים — זמן טוב לחשוב על מתנה.`
          );
        }

        return signals;
      }),
    personalPatterns,
    recommendationInsights,
  };
}
