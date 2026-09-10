"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { PersonRelationshipCard } from "@/components/features/PersonRelationshipCard";
import { EditPersonModal } from "@/components/features/EditPersonModal";
import { useApiCall } from "@/hooks/useApiCall";
import { useInsights } from "@/hooks/useInsights";
import { recordRecommendationOutcomeAction } from "@/app/actions/recommendations";
import type { PersonInsight } from "@/lib/family/types";
import type { Person } from "@/types";
import { BackToHome } from "@/components/layout/BackToHome";
import { AddContactModal, type NewContactInput } from "@/components/features/family/AddContactModal";
import { useT } from "@/lib/i18n/useT";

// Family Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): a
// relationship workspace, not a contacts list. Score/note/birthday still
// render instantly from the live store; health, interaction stats, the
// suggested next interaction, and the relationship timeline layer in once
// app/api/family/insights resolves — the same progressive-enhancement
// convention every other Experience Layer screen uses. People render in
// the order the route already ranked them (a real per-person Intelligence
// Engine signal, see the route), not a fixed list order.
export default function FamilyCarePage() {
  const t = useT();
  const people = useAtlasStore((s) => s.people);
  const addPerson = useAtlasStore((s) => s.addPerson);
  const logPersonInteraction = useAtlasStore((s) => s.logPersonInteraction);
  const addMoment = useAtlasStore((s) => s.addMoment);
  const setPersonBirthday = useAtlasStore((s) => s.setPersonBirthday);
  const setPersonAnniversary = useAtlasStore((s) => s.setPersonAnniversary);

  const [addOpen, setAddOpen] = useState(false);
  const { loading: addingPerson, error: addPersonError, run: createPerson } = useApiCall(addPerson);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

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

  function handleAddContact(input: NewContactInput) {
    if (!input.name.trim()) return;
    createPerson({ name: input.name.trim(), relation: input.relation, phone: input.phone })
      .then(() => setAddOpen(false))
      .catch(() => {
        // error is already captured in addPersonError for display below
      });
  }

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      <h1 className="mb-1 text-2xl font-medium tracking-tight">{t("page.family.title")}</h1>
      <p className="mb-10 text-sm text-muted">{t("page.family.subtitle")}</p>

      <div className="mb-10">
        <button
          onClick={() => setAddOpen(true)}
          className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-family/20 px-4 py-2 text-sm font-medium text-accent-family transition-opacity hover:opacity-80"
        >
          <UserPlus size={14} aria-hidden />
          הוסף איש קשר
        </button>
      </div>

      <AddContactModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={handleAddContact}
        saving={addingPerson}
        error={addPersonError}
      />

      {(logError || birthdayError || anniversaryError) && (
        <p className="-mt-6 mb-10 text-xs text-accent-family">
          {logError ?? birthdayError ?? anniversaryError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
            onEdit={setEditingPerson}
          />
        ))}
      </div>

      <EditPersonModal person={editingPerson} onClose={() => setEditingPerson(null)} />
    </main>
  );
}
