"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAtlasStore } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";
import type { LifeAreaKey } from "@/types";

interface AreaMomentsViewProps {
  title: string;
  description: string;
  areaKey: LifeAreaKey;
}

export function AreaMomentsView({ title, description, areaKey }: AreaMomentsViewProps) {
  const area = useAtlasStore((s) => s.lifeAreas.find((a) => a.key === areaKey));
  // Select the raw array (stable reference unless moments actually change) and
  // derive the filtered list via useMemo, rather than filtering inside the
  // Zustand selector itself — a selector that returns `.filter(...)` builds a
  // new array on every call, so any store update (even one touching a
  // completely different slice) looked like a change and re-rendered every
  // mounted area page (docs/TECH_DEBT.md #15).
  const allMoments = useAtlasStore((s) => s.moments);
  const addMoment = useAtlasStore((s) => s.addMoment);
  const { loading: saving, error: saveError, run: save } = useApiCall(addMoment);
  const [draft, setDraft] = useState("");

  const moments = useMemo(
    () => allMoments.filter((m) => m.category === areaKey),
    [allMoments, areaKey]
  );

  function handleAdd() {
    if (!draft.trim()) return;
    save({ category: areaKey, title: "רגע חדש", content: draft.trim() })
      .then(() => setDraft(""))
      .catch(() => {
        // error is already captured in saveError for display below
      });
  }

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">{title}</h1>
      <p className="mb-10 text-sm text-muted">{description}</p>

      <div className="flex flex-col gap-6">
        {area && (
          <GlassCard delay={0.05}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted">מדד התחום</span>
              <span className="text-foreground">{area.score}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full"
                style={{ width: `${area.score}%`, backgroundColor: `var(${area.colorVar})` }}
              />
            </div>
          </GlassCard>
        )}

        <GlassCard delay={0.1}>
          <p className="mb-3 text-sm font-medium text-muted">רגע חדש</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleAdd())}
            placeholder="מה קרה בתחום הזה?"
            aria-label="תוכן הרגע"
            rows={2}
            className="focus-ring mb-3 w-full resize-none rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          <button
            onClick={handleAdd}
            disabled={!draft.trim() || saving}
            className="rounded-lg bg-white/5 px-4 py-2 text-sm text-foreground transition-opacity disabled:opacity-40"
          >
            {saving ? "שומר…" : "שמור"}
          </button>
          {saveError && <p className="mt-2 text-xs text-accent-family">{saveError}</p>}
        </GlassCard>

        <GlassCard delay={0.15}>
          <p className="mb-4 text-sm font-medium text-muted">היסטוריה</p>
          <ul className="flex flex-col gap-3">
            {moments.map((moment, i) => (
              <motion.li
                key={moment.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.5), ease: "easeOut" }}
                className="rounded-xl bg-white/5 p-3 text-sm"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-foreground">{moment.title}</span>
                  <span className="ltr text-xs text-muted">
                    {new Date(moment.timestamp).toLocaleDateString("he-IL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
                <p className="text-foreground/70">{moment.content}</p>
              </motion.li>
            ))}
            {moments.length === 0 && <p className="text-sm text-muted">אין עדיין רגעים בתחום הזה.</p>}
          </ul>
        </GlassCard>
      </div>
    </main>
  );
}
