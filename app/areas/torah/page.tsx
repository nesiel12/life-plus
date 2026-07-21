"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { UploadCloud, FileAudio, Sparkles, Plus, Link2, Search } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { LearningInsightsHero } from "@/components/features/LearningInsightsHero";
import { KnowledgeLibraryCard } from "@/components/features/KnowledgeLibraryCard";
import { useApiCall } from "@/hooks/useApiCall";
import { recordRecommendationOutcomeAction } from "@/app/actions/recommendations";
import type { KnowledgeEntry } from "@/types";
import type { LearningInsights } from "@/lib/learning/types";

interface ExtractedShiur {
  fileName: string;
  topic: string;
  source: string;
  summary: string;
  durationMinutes?: number;
}

// Keyword-overlap check against the just-extracted (not-yet-saved) preview —
// distinct from the server-side relatedKnowledge insight (app/api/torah/
// insights), which only exists once an entry is actually saved. Kept as-is:
// real, cheap, client-side, and the one honest way to show "related to
// this" before there's a row to compute server insight against.
function findRelatedSessions(topic: string, entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const topicWords = new Set(topic.split(/\s+/));
  return entries.filter((entry) => entry.topic.split(/\s+/).some((word) => topicWords.has(word)));
}

export default function TorahSpacePage() {
  const knowledgeEntries = useAtlasStore((s) => s.knowledgeEntries);
  const addKnowledgeEntry = useAtlasStore((s) => s.addKnowledgeEntry);
  const markKnowledgeReviewed = useAtlasStore((s) => s.markKnowledgeReviewed);
  const [extracted, setExtracted] = useState<ExtractedShiur | null>(null);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Learning Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): streak,
  // progress, suggested next review, and per-entry related knowledge/memory/
  // goals — fetched client-side on mount, the same established pattern
  // AIBriefing/ScheduleSuggestions/Goals Experience v2 already use.
  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refreshInsights = () => setRefreshToken((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/torah/insights")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LearningInsights | null) => {
        if (!cancelled) setInsights(data);
      })
      .catch(() => {
        // Insights are a progressive enhancement — a failed fetch just means
        // the library renders without them, not an error state.
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, knowledgeEntries.length]);

  const entryInsightById = useMemo(() => {
    const map = new Map(insights?.entries.map((e) => [e.entryId, e]) ?? []);
    return map;
  }, [insights]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return knowledgeEntries;
    return knowledgeEntries.filter(
      (e) => e.topic.toLowerCase().includes(query) || e.summary.toLowerCase().includes(query)
    );
  }, [knowledgeEntries, search]);

  const {
    loading: processing,
    error: extractError,
    run: extract,
  } = useApiCall(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/torah/extract", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "עיבוד הקובץ נכשל. נסה שוב.");
    setExtracted({
      fileName: file.name,
      topic: data.topic,
      source: data.source,
      summary: data.summary,
      durationMinutes: data.durationMinutes,
    });
  });

  const { loading: saving, error: saveError, run: save } = useApiCall(addKnowledgeEntry);

  function handleFileSelected(file: File) {
    setExtracted(null);
    extract(file).catch(() => {
      // error is already captured in extractError for display below
    });
  }

  function addExtractedToSeder() {
    if (!extracted) return;
    save({
      date: new Date().toISOString().slice(0, 10),
      topic: extracted.topic,
      source: extracted.source,
      summary: extracted.summary,
      durationMinutes: extracted.durationMinutes,
    })
      .then(() => {
        setExtracted(null);
        refreshInsights();
      })
      .catch(() => {
        // error is already captured in saveError for display below
      });
  }

  // "Accept" the suggested next review *is* marking it reviewed — same
  // reasoning Goals Experience v2 uses for its next action (no separate
  // "I intend to" state), and reuses the exact Server Action calendar
  // suggestions and Goals already call for outcome tracking.
  function handleAcceptNextReview(entryId: string, recommendationEventId: string) {
    markKnowledgeReviewed(entryId).then(refreshInsights);
    recordRecommendationOutcomeAction(recommendationEventId, "accepted").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  }

  function handleDismissNextReview(recommendationEventId: string) {
    setInsights((prev) => (prev ? { ...prev, nextReview: null } : prev));
    recordRecommendationOutcomeAction(recommendationEventId, "rejected").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  }

  function handleMarkReviewed(entryId: string) {
    markKnowledgeReviewed(entryId).then(refreshInsights);
  }

  const relatedSessions = extracted ? findRelatedSessions(extracted.topic, knowledgeEntries) : [];

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">מרחב תורה</h1>
      <p className="mb-10 text-sm text-muted">ספריית הידע שלך — שיעורים, סיכומים, ותרגול לזיכרון.</p>

      <div className="flex flex-col gap-6">
        <LearningInsightsHero
          insights={insights}
          onAcceptNextReview={handleAcceptNextReview}
          onDismissNextReview={handleDismissNextReview}
        />

        <GlassCard delay={0.05}>
          <p className="mb-4 text-sm font-medium text-muted">העלאת שיעור (אודיו / PDF)</p>

          <input
            ref={inputRef}
            type="file"
            accept="audio/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
            }}
          />

          <button
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className="focus-ring flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-glass-border py-8 text-muted transition-colors hover:text-foreground disabled:opacity-40"
          >
            <UploadCloud size={24} aria-hidden />
            <span className="text-sm">גרור קובץ או לחץ לבחירה</span>
          </button>

          {extractError && <p className="mt-3 text-xs text-accent-family">{extractError}</p>}

          {processing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ease: "easeOut" }}
              className="mt-4 flex items-center gap-2 text-sm text-accent-knowledge"
            >
              <Sparkles size={16} className="animate-pulse" aria-hidden />
              מחלץ נושאים ומקורות…
            </motion.div>
          )}

          {extracted && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ease: "easeOut" }}
              className="mt-4 rounded-xl bg-white/5 p-4 text-sm"
            >
              <div className="mb-2 flex items-center gap-2 text-foreground/90">
                <FileAudio size={16} className="text-accent-knowledge" aria-hidden />
                {extracted.fileName}
              </div>
              <p>
                <span className="text-muted">נושא: </span>
                {extracted.topic}
              </p>
              <p>
                <span className="text-muted">מקור: </span>
                {extracted.source}
              </p>
              <p className="mb-3 text-foreground/70">
                {extracted.summary}
                {extracted.durationMinutes ? ` · ${extracted.durationMinutes} דק'` : ""}
              </p>

              {relatedSessions.length > 0 && (
                <div className="mb-3 rounded-lg bg-white/5 p-3">
                  <p className="mb-1 flex items-center gap-1 text-xs text-muted">
                    <Link2 size={12} aria-hidden />
                    קשור לשיעורים קודמים
                  </p>
                  {relatedSessions.map((s) => (
                    <p key={s.id} className="text-xs text-foreground/70">
                      {s.topic} · {s.date}
                    </p>
                  ))}
                </div>
              )}

              <button
                onClick={addExtractedToSeder}
                disabled={saving}
                className="focus-ring flex items-center gap-1 rounded-lg bg-accent-faith/20 px-3 py-1.5 text-xs text-accent-faith disabled:opacity-40"
              >
                <Plus size={14} aria-hidden />
                {saving ? "שומר…" : "הוסף לספרייה"}
              </button>
              {saveError && <p className="mt-2 text-xs text-accent-family">{saveError}</p>}
            </motion.div>
          )}
        </GlassCard>

        <div className="relative">
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש בספריית הידע…"
            aria-label="חיפוש בספריית הידע"
            className="focus-ring w-full rounded-lg bg-white/5 py-2 pe-9 ps-3 text-sm text-foreground placeholder:text-muted"
          />
        </div>

        <div className="flex flex-col gap-4">
          {filteredEntries.map((entry, i) => (
            <KnowledgeLibraryCard
              key={entry.id}
              entry={entry}
              insight={entryInsightById.get(entry.id)}
              delay={Math.min(i * 0.05, 0.5)}
              onMarkReviewed={() => handleMarkReviewed(entry.id)}
            />
          ))}
          {filteredEntries.length === 0 && knowledgeEntries.length > 0 && (
            <p className="text-sm text-muted">אין תוצאות בספרייה עבור החיפוש הזה.</p>
          )}
          {knowledgeEntries.length === 0 && (
            <p className="text-sm text-muted">אין עדיין שיעורים בספרייה. העלה קובץ כדי להתחיל.</p>
          )}
        </div>
      </div>
    </main>
  );
}
