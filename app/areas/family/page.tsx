"use client";

import { useEffect, useMemo, useState } from "react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { PersonRelationshipCard } from "@/components/features/PersonRelationshipCard";
import { useApiCall } from "@/hooks/useApiCall";
import { recordRecommendationOutcomeAction } from "@/app/actions/recommendations";
import type { PersonInsight } from "@/lib/family/types";

// Family Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): a
// relationship workspace, not a contacts list. Score/note/birthday still
// render instantly from the live store; health, interaction stats, the
// suggested next interaction, and the relationship timeline layer in once
// app/api/family/insights resolves — the same progressive-enhancement
// convention every other Experience Layer screen uses. People render in
// the order the route already ranked them (a real per-person Intelligence
// Engine signal, see the route), not a fixed list order.
export default function FamilyCarePage() {
  const people = useAtlasStore((s) => s.people);
  const logPersonInteraction = useAtlasStore((s) => s.logPersonInteraction);
  const addMoment = useAtlasStore((s) => s.addMoment);
  const setPersonBirthday = useAtlasStore((s) => s.setPersonBirthday);

  const [insights, setInsights] = useState<PersonInsight[] | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refreshInsights = () => setRefreshToken((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/family/insights")
      .then((res) => (res.ok ? res.json() : { people: [] }))
      .then((data: { people: PersonInsight[] }) => {
        if (!cancelled) setInsights(data.people);
      })
      .catch(() => {
        // Insights are a progressive enhancement — a failed fetch just
        // means cards render without them.
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, people.length]);

  const insightByPersonId = useMemo(() => new Map((insights ?? []).map((i) => [i.personId, i])), [insights]);
  const orderedPeople = insights
    ? insights.map((i) => people.find((p) => p.id === i.personId)).filter((p): p is (typeof people)[number] => Boolean(p))
    : people;

  const { error: logError, run: logInteraction } = useApiCall(async (personId: string, name: string) => {
    await logPersonInteraction(personId);
    await addMoment({
      category: "family",
      title: `רגע עם ${name}`,
      content: `תיעוד רגע משמעותי עם ${name}.`,
      personId,
    });
  });
  const { error: birthdayError, run: submitBirthday } = useApiCall(setPersonBirthday);

  function handleLogMoment(personId: string, name: string) {
    logInteraction(personId, name)
      .then(refreshInsights)
      .catch(() => {
        // error is already captured in logError for display below
      });
  }

  function handleAcceptAction(personId: string, recommendationEventId: string, name: string) {
    logInteraction(personId, name).then(refreshInsights);
    recordRecommendationOutcomeAction(recommendationEventId, "accepted").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  }

  function handleDismissAction(recommendationEventId: string) {
    setInsights((prev) =>
      prev
        ? prev.map((insight) =>
            insight.suggestedAction?.recommendationEventId === recommendationEventId
              ? { ...insight, suggestedAction: null }
              : insight
          )
        : prev
    );
    recordRecommendationOutcomeAction(recommendationEventId, "rejected").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  }

  function handleSaveBirthday(personId: string, birthday: string) {
    submitBirthday(personId, birthday).catch(() => {
      // error is already captured in birthdayError for display below
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">לוח הקשבה משפחתי</h1>
      <p className="mb-10 text-sm text-muted">לא CRM — פשוט מקום לזכור את מי שחשוב.</p>
      {(logError || birthdayError) && (
        <p className="-mt-6 mb-10 text-xs text-accent-family">{logError ?? birthdayError}</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {orderedPeople.map((person, i) => (
          <PersonRelationshipCard
            key={person.id}
            person={person}
            insight={insightByPersonId.get(person.id)}
            delay={Math.min(i * 0.06, 0.3)}
            onLogMoment={handleLogMoment}
            onAcceptAction={handleAcceptAction}
            onDismissAction={handleDismissAction}
            onSaveBirthday={handleSaveBirthday}
          />
        ))}
      </div>
    </main>
  );
}
