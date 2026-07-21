"use client";

import { useEffect, useState } from "react";
import { Sparkles, Target } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { GoalJourneyCard } from "@/components/features/GoalJourneyCard";
import { useApiCall } from "@/hooks/useApiCall";
import { recordRecommendationOutcomeAction } from "@/app/actions/recommendations";
import { cn } from "@/lib/utils";
import { LIFE_AREA_LIST } from "@/lib/lifeAreas";
import type { LifeAreaKey } from "@/types";
import type { GoalInsight } from "@/lib/goals/types";

export function GoalsPanel() {
  const goals = useAtlasStore((s) => s.goals);
  const addGoal = useAtlasStore((s) => s.addGoal);
  const toggleMilestone = useAtlasStore((s) => s.toggleMilestone);
  const removeGoal = useAtlasStore((s) => s.removeGoal);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LifeAreaKey>("knowledge");

  // Goals Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §4): the "smart"
  // per-goal layer — stage, estimated completion, next recommended action,
  // related memory — fetched from app/api/goals/insights the same
  // client-side-on-mount way AIBriefing/ScheduleSuggestions already
  // established. Keyed by goalId so a card can render instantly from the
  // live store and layer the insight in once it arrives.
  const [insights, setInsights] = useState<Record<string, GoalInsight>>({});
  // Bumped after any mutation that changes stage/progress/next-action
  // (toggle, accept, create, remove) — same "bump a counter to re-run an
  // effect" idiom app/layout's AppShell already uses for its retry button.
  const [refreshToken, setRefreshToken] = useState(0);
  const refreshInsights = () => setRefreshToken((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goals/insights")
      .then((res) => (res.ok ? res.json() : { goals: [] }))
      .then((data: { goals: GoalInsight[] }) => {
        if (cancelled) return;
        setInsights(Object.fromEntries(data.goals.map((insight) => [insight.goalId, insight])));
      })
      .catch(() => {
        // Insights are a progressive enhancement — a failed fetch just means
        // cards stay in their base (store-only) form, not an error state.
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, goals.length]);

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

  function handleToggleMilestone(goalId: string, milestoneId: string) {
    toggleMilestone(goalId, milestoneId).then(refreshInsights);
  }

  function handleRemove(goalId: string) {
    removeGoal(goalId).then(refreshInsights);
  }

  // "Accept" the recommended next action is, concretely, completing that
  // milestone — there's no separate "I intend to" state, the same way
  // checking a milestone off already works everywhere else in the app.
  // Recording the outcome (Recommendation Intelligence's feedback loop,
  // docs/ATLAS_ARCHITECTURE_VISION.md §7) reuses the exact Server Action
  // store/useAtlasStore.ts's acceptSuggestion/dismissSuggestion already call
  // for calendar suggestions — no new tracking mechanism for this surface.
  function handleAcceptNextAction(goalId: string, milestoneId: string, recommendationEventId: string) {
    toggleMilestone(goalId, milestoneId).then(refreshInsights);
    recordRecommendationOutcomeAction(recommendationEventId, "accepted").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  }

  function handleDismissNextAction(goalId: string, recommendationEventId: string) {
    setInsights((prev) =>
      prev[goalId] ? { ...prev, [goalId]: { ...prev[goalId], nextAction: null } } : prev
    );
    recordRecommendationOutcomeAction(recommendationEventId, "rejected").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
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
          aria-label="כותרת היעד החדש"
          className="focus-ring flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as LifeAreaKey)}
          aria-label="תחום החיים של היעד"
          className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground"
        >
          {LIFE_AREA_LIST.map((area) => (
            <option key={area.key} value={area.key} className="bg-background">
              {categoryLabel(area.key)}
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

      <div className="flex flex-col gap-4">
        {goals.map((goal, gi) => (
          <GoalJourneyCard
            key={goal.id}
            goal={goal}
            insight={insights[goal.id]}
            delay={gi * 0.05}
            onToggleMilestone={(milestoneId) => handleToggleMilestone(goal.id, milestoneId)}
            onRemove={() => handleRemove(goal.id)}
            onAcceptNextAction={(milestoneId, recommendationEventId) =>
              handleAcceptNextAction(goal.id, milestoneId, recommendationEventId)
            }
            onDismissNextAction={(recommendationEventId) => handleDismissNextAction(goal.id, recommendationEventId)}
          />
        ))}
        {goals.length === 0 && <p className="text-sm text-muted">אין עדיין יעדים פעילים.</p>}
      </div>
    </GlassCard>
  );
}
