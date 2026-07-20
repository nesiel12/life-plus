"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { UploadCloud, FileAudio, Sparkles, Plus, Link2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";
import type { KnowledgeEntry } from "@/types";

interface ExtractedShiur {
  fileName: string;
  topic: string;
  source: string;
  summary: string;
  durationMinutes?: number;
}

function findRelatedSessions(topic: string, entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const topicWords = new Set(topic.split(/\s+/));
  return entries.filter((entry) => entry.topic.split(/\s+/).some((word) => topicWords.has(word)));
}

export default function TorahSpacePage() {
  const knowledgeEntries = useAtlasStore((s) => s.knowledgeEntries);
  const addKnowledgeEntry = useAtlasStore((s) => s.addKnowledgeEntry);
  const [extracted, setExtracted] = useState<ExtractedShiur | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      .then(() => setExtracted(null))
      .catch(() => {
        // error is already captured in saveError for display below
      });
  }

  const relatedSessions = extracted ? findRelatedSessions(extracted.topic, knowledgeEntries) : [];

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">מרחב תורה</h1>
      <p className="mb-10 text-sm text-muted">מעקב סדר בוקר, שיעורים ושאלות.</p>

      <div className="flex flex-col gap-6">
        <GlassCard delay={0.05}>
          <p className="mb-4 text-sm font-medium text-muted">סדר בוקר</p>
          <ul className="flex flex-col gap-3">
            {knowledgeEntries.map((entry) => (
              <li key={entry.id} className="rounded-xl bg-white/5 p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-foreground">{entry.topic}</span>
                  <span className="ltr text-xs text-muted">{entry.date}</span>
                </div>
                <p className="text-foreground/70">{entry.summary}</p>
                <span className="text-xs text-muted">
                  {entry.source}
                  {entry.durationMinutes ? ` · ${entry.durationMinutes} דק'` : ""}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard delay={0.1}>
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
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-glass-border py-8 text-muted transition-colors hover:text-foreground disabled:opacity-40"
          >
            <UploadCloud size={24} />
            <span className="text-sm">גרור קובץ או לחץ לבחירה</span>
          </button>

          {extractError && <p className="mt-3 text-xs text-accent-family">{extractError}</p>}

          {processing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 flex items-center gap-2 text-sm text-accent-knowledge"
            >
              <Sparkles size={16} className="animate-pulse" />
              מחלץ נושאים ומקורות…
            </motion.div>
          )}

          {extracted && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-xl bg-white/5 p-4 text-sm"
            >
              <div className="mb-2 flex items-center gap-2 text-foreground/90">
                <FileAudio size={16} className="text-accent-knowledge" />
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
                    <Link2 size={12} />
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
                className="flex items-center gap-1 rounded-lg bg-accent-faith/20 px-3 py-1.5 text-xs text-accent-faith disabled:opacity-40"
              >
                <Plus size={14} />
                {saving ? "שומר…" : "הוסף לסדר"}
              </button>
              {saveError && <p className="mt-2 text-xs text-accent-family">{saveError}</p>}
            </motion.div>
          )}
        </GlassCard>
      </div>
    </main>
  );
}
