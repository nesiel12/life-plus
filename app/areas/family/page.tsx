"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { PersonRelationshipCard } from "@/components/features/PersonRelationshipCard";
import { useApiCall } from "@/hooks/useApiCall";
import { useInsights } from "@/hooks/useInsights";
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
  const addPerson = useAtlasStore((s) => s.addPerson);
  const logPersonInteraction = useAtlasStore((s) => s.logPersonInteraction);
  const addMoment = useAtlasStore((s) => s.addMoment);
  const setPersonBirthday = useAtlasStore((s) => s.setPersonBirthday);
  const setPersonAnniversary = useAtlasStore((s) => s.setPersonAnniversary);

  const [newName, setNewName] = useState("");
  const [newRelation, setNewRelation] = useState("");
  const { loading: addingPerson, error: addPersonError, run: createPerson } = useApiCall(addPerson);

  const { data, setData, refresh: refreshInsights } = useInsights<{ people: PersonInsight[] }>(
    "/api/family/insights",
    { people: [] },
    [people.length]
  );
  const insights = data?.people ?? null;

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
  const { error: anniversaryError, run: submitAnniversary } = useApiCall(setPersonAnniversary);

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
    setData((prev) =>
      prev
        ? {
            people: prev.people.map((insight) =>
              insight.suggestedAction?.recommendationEventId === recommendationEventId
                ? { ...insight, suggestedAction: null }
                : insight
            ),
          }
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

  function handleSaveAnniversary(personId: string, anniversary: string) {
    submitAnniversary(personId, anniversary).catch(() => {
      // error is already captured in anniversaryError for display below
    });
  }

  function handleAddPerson() {
    const name = newName.trim();
    const relation = newRelation.trim();
    if (!name || !relation) return;
    createPerson({ name, relation })
      .then(() => {
        setNewName("");
        setNewRelation("");
      })
      .catch(() => {
        // error is already captured in addPersonError for display below
      });
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">לוח הקשבה משפחתי</h1>
      <p className="mb-10 text-sm text-muted">לא CRM — פשוט מקום לזכור את מי שחשוב.</p>

      <div className="mb-10 flex flex-col gap-2 sm:flex-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddPerson()}
          placeholder="שם, למשל: אמא"
          aria-label="שם איש הקשר החדש"
          className="focus-ring flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <input
          value={newRelation}
          onChange={(e) => setNewRelation(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddPerson()}
          placeholder="קרבה, למשל: אמא"
          aria-label="הקרבה של איש הקשר החדש"
          className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted sm:w-40"
        />
        <button
          onClick={handleAddPerson}
          disabled={!newName.trim() || !newRelation.trim() || addingPerson}
          className="focus-ring flex items-center justify-center gap-1 rounded-lg bg-accent-family/20 px-3 py-2 text-sm text-accent-family transition-opacity disabled:opacity-40"
        >
          <UserPlus size={14} />
          {addingPerson ? "מוסיף…" : "הוסף איש קשר"}
        </button>
      </div>

      {(logError || birthdayError || anniversaryError || addPersonError) && (
        <p className="-mt-6 mb-10 text-xs text-accent-family">
          {logError ?? birthdayError ?? anniversaryError ?? addPersonError}
        </p>
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
            onSaveAnniversary={handleSaveAnniversary}
          />
        ))}
      </div>
    </main>
  );
}
