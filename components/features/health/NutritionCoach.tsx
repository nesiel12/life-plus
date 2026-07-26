"use client";

import { motion } from "framer-motion";
import { Loader2, Salad, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";
import type { Meal, Workout } from "@/types";

interface SuggestedMenuItem {
  item: string;
  benefit: string;
}

interface NutritionRecommendation {
  recommendation: string;
  suggested_menu: SuggestedMenuItem[];
}

interface NutritionCoachProps {
  workouts: Workout[];
  meals: Meal[];
  recommendation: NutritionRecommendation | null;
  onRecommendation: (recommendation: NutritionRecommendation) => void;
}

// Health & Fitness Space (Phase 8)'s "AI Nutrition Coach" — one prominent
// button that sends today's real workouts + already-logged meals to
// /api/ai/nutrition and renders the structured result. Deliberately no
// persistence and no shared lib/ai module: this is a single-caller,
// ephemeral-result feature (same shape as DailyRecommendations' "analyze"
// button before its cross-session cache was added), not a write-heavy flow
// like the Learning Space's Track Builder.
export function NutritionCoach({ workouts, meals, recommendation, onRecommendation }: NutritionCoachProps) {
  const { loading, error, run: analyze } = useApiCall(async () => {
    const res = await fetch("/api/ai/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workouts: workouts.map((w) => ({
          title: w.title,
          startTime: w.startTime,
          endTime: w.endTime,
          routineDetails: w.routineDetails,
        })),
        meals: meals.map((m) => ({
          description: m.description,
          eatenAt: m.eatenAt,
          type: m.type,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "יצירת ההמלצה נכשלה. נסה שוב.");
    onRecommendation(data as NutritionRecommendation);
  });

  function handleAnalyze() {
    if (loading) return;
    analyze().catch(() => {
      // error is already captured in error for display below
    });
  }

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Salad size={15} className="text-accent-fitness" aria-hidden />
            מאמן תזונה אישי
          </p>
          <p className="mt-0.5 text-xs text-muted">
            המלצה מותאמת אישית לפי האימונים והארוחות שנרשמו היום.
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-fitness/20 px-4 py-2 text-sm font-medium text-accent-fitness transition-opacity hover:opacity-80 disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
          {loading ? "בונה תפריט…" : "תפריט מותאם אישית"}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-3 py-6">
          <motion.div
            animate={{
              boxShadow: [
                "0 0 20px -6px color-mix(in srgb, var(--accent-fitness) 45%, transparent)",
                "0 0 44px -6px color-mix(in srgb, var(--accent-fitness) 75%, transparent)",
                "0 0 20px -6px color-mix(in srgb, var(--accent-fitness) 45%, transparent)",
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-fitness/10"
          >
            <Sparkles size={16} className="text-accent-fitness" aria-hidden />
          </motion.div>
          <p className="text-sm text-muted">מנתח את העומס הגופני של היום…</p>
        </div>
      )}

      {error && <p className="text-xs text-accent-family">{error}</p>}

      {!loading && recommendation && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex flex-col gap-3"
        >
          <p className="rounded-xl bg-accent-fitness/10 p-3 text-sm leading-relaxed text-foreground/90">
            {recommendation.recommendation}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {recommendation.suggested_menu.map((item, i) => (
              <div key={i} className="rounded-lg bg-white/5 p-3">
                <p className="text-sm font-medium text-foreground">{item.item}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.benefit}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </GlassCard>
  );
}
