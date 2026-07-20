"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Trash2, Target } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";
import { cn } from "@/lib/utils";
import type { LifeAreaKey } from "@/types";

const CATEGORY_OPTIONS: LifeAreaKey[] = ["faith", "family", "knowledge", "health", "career"];

export function GoalsPanel() {
  const goals = useAtlasStore((s) => s.goals);
  const addGoal = useAtlasStore((s) => s.addGoal);
  const toggleMilestone = useAtlasStore((s) => s.toggleMilestone);
  const removeGoal = useAtlasStore((s) => s.removeGoal);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LifeAreaKey>("knowledge");

  const {
    loading: breaking,
    error: breakdownError,
    run: createGoal,
  } = useApiCall(async (trimmedTitle: string, selectedCategory: LifeAreaKey) => {
    const res = await fetch("/api/goals/breakdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmedTitle, category: selectedCategory }),
    });
    if (!res.ok) throw new Error("לא הצלחנו לפרק את היעד. נסה שוב.");
    const data = await res.json();
    await addGoal(trimmedTitle, selectedCategory, data.milestones ?? []);
    setTitle("");
  });

  function handleCreateGoal() {
    const trimmed = title.trim();
    if (!trimmed) return;
    createGoal(trimmed, category).catch(() => {
      // error is already captured in breakdownError for display below
    });
  }

  return (
    <GlassCard delay={0.25}>
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
        <Target size={16} />
        יעדים פעילים
      </p>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateGoal()}
          placeholder="יעד חדש, למשל: ללמוד מסכת חדשה"
          className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as LifeAreaKey)}
          className="rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c} className="bg-background">
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <button
          onClick={handleCreateGoal}
          disabled={!title.trim() || breaking}
          className="flex items-center justify-center gap-1 rounded-lg bg-accent-faith/20 px-3 py-2 text-sm text-accent-faith transition-opacity disabled:opacity-40"
        >
          <Sparkles size={14} className={cn(breaking && "animate-pulse")} />
          {breaking ? "מפרק ליעדים…" : "פרק ליעדים"}
        </button>
      </div>

      {breakdownError && <p className="mb-4 text-xs text-accent-family">{breakdownError}</p>}

      <ul className="flex flex-col gap-4">
        {goals.map((goal, gi) => {
          const doneCount = goal.milestones.filter((m) => m.done).length;
          const progress = goal.milestones.length
            ? Math.round((doneCount / goal.milestones.length) * 100)
            : 0;
          return (
            <motion.li
              key={goal.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: gi * 0.05 }}
              className="rounded-xl bg-white/5 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{goal.title}</p>
                  <span className="text-xs text-muted">{categoryLabel(goal.category)}</span>
                </div>
                <button
                  onClick={() => removeGoal(goal.id)}
                  className="text-muted transition-colors hover:text-foreground"
                  aria-label="מחק יעד"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-accent-faith"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <ul className="flex flex-col gap-1.5">
                {goal.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() => toggleMilestone(goal.id, m.id)}
                      className="accent-current"
                    />
                    <span className={cn(m.done && "text-muted line-through")}>{m.title}</span>
                  </li>
                ))}
              </ul>
            </motion.li>
          );
        })}
        {goals.length === 0 && <p className="text-sm text-muted">אין עדיין יעדים פעילים.</p>}
      </ul>
    </GlassCard>
  );
}
