"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { HeartHandshake, Cake } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { daysSince, daysUntilNextBirthday } from "@/lib/utils";

const STALE_THRESHOLD_DAYS = 7;

export default function FamilyCarePage() {
  const people = useAtlasStore((s) => s.people);
  const logPersonInteraction = useAtlasStore((s) => s.logPersonInteraction);
  const addMoment = useAtlasStore((s) => s.addMoment);
  const setPersonBirthday = useAtlasStore((s) => s.setPersonBirthday);
  const [editingBirthdayFor, setEditingBirthdayFor] = useState<string | null>(null);
  const [birthdayDraft, setBirthdayDraft] = useState("");

  function handleLog(personId: string, name: string) {
    logPersonInteraction(personId);
    addMoment({ category: "family", title: `רגע עם ${name}`, content: `תיעוד רגע משמעותי עם ${name}.` });
  }

  function saveBirthday(personId: string) {
    if (/^\d{2}-\d{2}$/.test(birthdayDraft)) {
      setPersonBirthday(personId, birthdayDraft);
    }
    setEditingBirthdayFor(null);
    setBirthdayDraft("");
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">לוח הקשבה משפחתי</h1>
      <p className="mb-10 text-sm text-muted">לא CRM — פשוט מקום לזכור את מי שחשוב.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {people.map((person, i) => {
          const since = person.lastMeaningfulInteraction
            ? daysSince(person.lastMeaningfulInteraction)
            : null;
          const isStale = since !== null && since >= STALE_THRESHOLD_DAYS;
          const untilBirthday = person.birthday ? daysUntilNextBirthday(person.birthday) : null;

          return (
            <motion.div
              key={person.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <GlassCard className="h-full">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{person.hebrewName ?? person.name}</p>
                    <p className="text-xs text-muted">{person.relation}</p>
                  </div>
                  <HeartHandshake size={18} className="text-accent-family" />
                </div>

                {person.note && <p className="mb-2 text-sm text-foreground/70">{person.note}</p>}

                <p className="mb-2 text-xs text-muted">
                  {since === null
                    ? "אין עדיין תיעוד"
                    : since === 0
                      ? "רגע היום"
                      : `לפני ${since} ימים`}
                </p>

                {untilBirthday !== null && (
                  <p className="mb-2 flex items-center gap-1 text-xs text-accent-family">
                    <Cake size={12} />
                    יום הולדת בעוד {untilBirthday} ימים
                  </p>
                )}

                {isStale && (
                  <p className="mb-3 text-xs text-accent-faith">
                    לא תיעדת רגע עם {person.hebrewName ?? person.name} לאחרונה.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleLog(person.id, person.hebrewName ?? person.name)}
                    className="rounded-lg bg-accent-family/15 px-3 py-1.5 text-xs text-accent-family transition-opacity hover:opacity-80"
                  >
                    רשום רגע איתם
                  </button>

                  {editingBirthdayFor === person.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={birthdayDraft}
                        onChange={(e) => setBirthdayDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveBirthday(person.id)}
                        placeholder="MM-DD"
                        className="ltr w-20 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => saveBirthday(person.id)}
                        className="text-xs text-accent-family"
                      >
                        שמור
                      </button>
                    </div>
                  ) : (
                    !person.birthday && (
                      <button
                        onClick={() => setEditingBirthdayFor(person.id)}
                        className="text-xs text-muted transition-colors hover:text-foreground"
                      >
                        הוסף יום הולדת
                      </button>
                    )
                  )}
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>
    </main>
  );
}
