import "server-only";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { goalsRepo } from "@/lib/db/goals";
import { lifeAreaScoresRepo } from "@/lib/db/lifeAreaScores";
import { upcomingEventsRepo } from "@/lib/db/upcomingEvents";
import { peopleRepo } from "@/lib/db/people";
import { toGoal, toLifeArea, toUpcomingEvent, toPerson } from "@/lib/mappers";
import { retrieveRelevantMemory } from "@/lib/memory/retrieveMemory";
import { getPersonalPatternDescriptions } from "@/lib/intelligence/personalDNA";
import { daysSince } from "@/lib/utils";
import type { AtlasContext, BuildContextOptions } from "@/lib/context/types";

const DEFAULT_STALE_THRESHOLD_DAYS = 7;
const MAX_UPCOMING_EVENTS = 5;
const MAX_PERSONAL_PATTERNS = 5;

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
  const [personalDNA, goalRows, lifeAreaRows, upcomingEventRows, peopleRows, relevantMemory, personalPatterns] =
    await Promise.all([
      personalDnaRepo.get(userId),
      goalsRepo.listWithMilestones(userId),
      lifeAreaScoresRepo.list(userId),
      upcomingEventsRepo.list(userId),
      peopleRepo.list(userId),
      options.query
        ? retrieveRelevantMemory(userId, options.query, options.memoryLimit)
        : Promise.resolve([]),
      getPersonalPatternDescriptions(userId, MAX_PERSONAL_PATTERNS),
    ]);

  // Same rule the family page uses for its own stale-contact threshold
  // (docs/BACKLOG.md) — kept identical here rather than reinvented, so
  // "Atlas thinks you're overdue to reach out" always means the same thing
  // everywhere it's said.
  const staleThresholdDays = personalDNA?.family_check_in_interval_days ?? DEFAULT_STALE_THRESHOLD_DAYS;

  return {
    personalDNA,
    activeGoals: goalRows.map(toGoal).map((goal) => {
      const done = goal.milestones.filter((m) => m.done).length;
      const progress = goal.milestones.length ? Math.round((done / goal.milestones.length) * 100) : 0;
      return `${goal.title} — ${progress}% הושלם`;
    }),
    lifeAreas: lifeAreaRows.map(toLifeArea),
    upcomingEvents: upcomingEventRows
      .map(toUpcomingEvent)
      .slice(0, MAX_UPCOMING_EVENTS)
      .map((event) => `${event.title} (${event.date})`),
    relevantMemory,
    relationshipSignals: peopleRows
      .map(toPerson)
      .map((person) => {
        if (!person.lastMeaningfulInteraction) return null;
        const since = daysSince(person.lastMeaningfulInteraction);
        if (since < staleThresholdDays) return null;
        return `לא יצרת קשר עם ${person.hebrewName ?? person.name} כבר ${since} ימים`;
      })
      .filter((signal): signal is string => signal !== null),
    personalPatterns,
  };
}
