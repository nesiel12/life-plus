"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Dumbbell, HeartPulse, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { GlassCard } from "@/components/ui/GlassCard";
import { WellnessCopilot } from "@/components/features/health/WellnessCopilot";
import { NewWorkoutModal } from "@/components/features/health/NewWorkoutModal";
import { NutritionCoach } from "@/components/features/health/NutritionCoach";
import { WaterTracker } from "@/components/features/health/WaterTracker";
import { MacroRings } from "@/components/features/health/MacroRings";
import { MealQuickLog } from "@/components/features/health/MealQuickLog";
import { WorkoutHub } from "@/components/features/health/WorkoutHub";
import { EnergyWindowGauge } from "@/components/features/health/EnergyWindowGauge";
import { useHealthTargets } from "@/components/features/health/useHealthData";
import { INTENSITY_LABELS, WORKOUT_KINDS, estimateCaloriesBurned } from "@/lib/health/workout";
import type { MealType, Workout } from "@/types";
import { BackToHome } from "@/components/layout/BackToHome";

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "ארוחת בוקר",
  lunch: "ארוחת צהריים",
  dinner: "ארוחת ערב",
  snack: "חטיף",
  "post-workout": "לאחר אימון",
};

const MACRO_SOURCE_LABEL = { ai: "הערכת AI", preset: "מנה מוכנה", user: "הוזן ידנית" } as const;

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isToday(iso: string, todayKey: string): boolean {
  return toDateKey(new Date(iso)) === todayKey;
}

interface SuggestedMenuItem {
  item: string;
  benefit: string;
}

interface NutritionRecommendation {
  recommendation: string;
  suggested_menu: SuggestedMenuItem[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function workoutMinutes(w: Workout): number | null {
  if (!w.endTime) return null;
  return Math.max(0, Math.round((new Date(w.endTime).getTime() - new Date(w.startTime).getTime()) / 60_000));
}

/**
 * בריאות — a visual dashboard: water, nutrition rings, the day's energy curve,
 * a live workout hub, and the meal log, with the AI coach underneath.
 *
 * The dry text cards this replaces ("כוס מים", "חלון האנרגיה", "ארוחות (0)")
 * are now instruments: each one is something to tap, not something to read.
 */
export default function HealthSpacePage() {
  const reduceMotion = useReducedMotion();
  const meals = useAtlasStore((s) => s.meals);
  const workouts = useAtlasStore((s) => s.workouts);
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);
  const addMeal = useAtlasStore((s) => s.addMeal);
  const deleteMeal = useAtlasStore((s) => s.deleteMeal);
  const addWorkout = useAtlasStore((s) => s.addWorkout);
  const deleteWorkout = useAtlasStore((s) => s.deleteWorkout);
  const { targets, custom, save: saveTargets } = useHealthTargets();

  const [mealDrawerOpen, setMealDrawerOpen] = useState(false);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [recommendation, setRecommendation] = useState<NutritionRecommendation | null>(null);

  const { error: deleteMealError, run: removeMeal } = useApiCall(deleteMeal);
  const { error: deleteWorkoutError, run: removeWorkout } = useApiCall(deleteWorkout);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const todaysMeals = useMemo(
    () => meals.filter((m) => isToday(m.eatenAt, todayKey)).sort((a, b) => a.eatenAt.localeCompare(b.eatenAt)),
    [todayKey, meals]
  );
  const todaysWorkouts = useMemo(() => workouts.filter((w) => isToday(w.startTime, todayKey)), [todayKey, workouts]);
  const recentWorkouts = useMemo(
    () => [...workouts].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 8),
    [workouts]
  );

  return (
    <main className="min-h-screen px-4 py-12 sm:px-8 lg:px-12">
      <BackToHome className="mb-6 -ms-2.5" />
      <header className="mb-7">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <HeartPulse size={22} className="text-accent-fitness" aria-hidden />
          בריאות
        </h1>
        <p className="text-sm text-muted">מים, תזונה, אנרגיה ואימונים — הכל חי, הכל בלחיצה.</p>
      </header>

      {/* Water + nutrition. */}
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <WaterTracker targetMl={targets.waterMl} />
        <div className="lg:col-span-2">
          <MacroRings meals={todaysMeals} targets={targets} custom={custom} onSaveTargets={saveTargets} />
        </div>
      </div>

      <div className="mb-5">
        <EnergyWindowGauge chronotype={chronotype} meals={todaysMeals} workouts={todaysWorkouts} />
      </div>

      {/* Workouts + today's meals. */}
      <div className="mb-5 grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <WorkoutHub workouts={workouts} onLog={addWorkout} />
        </div>

        <section className="glass-card flex flex-col gap-4 rounded-3xl p-5 lg:col-span-2" aria-labelledby="meals-title">
          <header className="flex items-center justify-between gap-2">
            <h2 id="meals-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
              <UtensilsCrossed size={17} className="text-accent-fitness" aria-hidden />
              הארוחות של היום
            </h2>
            <motion.button
              type="button"
              onClick={() => setMealDrawerOpen(true)}
              whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-accent-fitness px-3.5 py-1.5 text-xs font-medium text-white"
            >
              <Plus size={13} aria-hidden />
              רשום ארוחה
            </motion.button>
          </header>

          {deleteMealError && <p className="text-xs text-accent-family">{deleteMealError}</p>}

          {todaysMeals.length === 0 ? (
            <button
              type="button"
              onClick={() => setMealDrawerOpen(true)}
              className="focus-ring flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline-card px-4 py-8 text-center transition-colors hover:border-accent-fitness/40"
            >
              <span className="text-3xl" aria-hidden>
                🍽️
              </span>
              <span className="text-sm font-medium text-foreground/85">הצלחת עוד ריקה היום</span>
              <span className="text-xs text-muted">בחר מנה בלחיצה, או ספר מה אכלת — בקול או בהקלדה.</span>
            </button>
          ) : (
            <ol className="relative flex flex-col gap-3 before:absolute before:inset-y-2 before:start-[0.6rem] before:w-px before:bg-hairline">
              <AnimatePresence initial={false}>
                {todaysMeals.map((meal) => (
                  <motion.li
                    key={meal.id}
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, x: 20 }}
                    className="relative flex items-start gap-3 ps-6"
                  >
                    <span className="absolute start-1 top-2 size-3 rounded-full border-2 border-accent-fitness bg-surface" aria-hidden />
                    <div className="min-w-0 flex-1 rounded-2xl border border-hairline-card bg-surface px-3.5 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{meal.description}</p>
                          <p className="text-[0.7rem] text-muted">
                            {MEAL_TYPE_LABEL[meal.type]} · <span className="ltr">{formatTime(meal.eatenAt)}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => removeMeal(meal.id).catch(() => undefined)}
                          aria-label={`מחק את ${meal.description}`}
                          className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </div>
                      {meal.calories != null ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.65rem]">
                          <span className="ltr rounded-full bg-accent-fitness/12 px-2 py-0.5 font-medium tabular-nums text-accent-fitness">
                            {meal.calories} kcal
                          </span>
                          <span className="ltr rounded-full bg-fill-subtle px-2 py-0.5 tabular-nums text-muted">
                            P {Math.round(meal.proteinG ?? 0)} · C {Math.round(meal.carbsG ?? 0)} · F {Math.round(meal.fatG ?? 0)}
                          </span>
                          {meal.macroSource && <span className="text-muted">{MACRO_SOURCE_LABEL[meal.macroSource]}</span>}
                        </div>
                      ) : (
                        <p className="mt-1 text-[0.65rem] text-muted">ללא הערכת ערכים</p>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </section>
      </div>

      {/* Recent training. */}
      <section className="mb-5" aria-labelledby="history-title">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="history-title" className="flex items-center gap-2 text-sm font-medium text-muted">
            <Dumbbell size={14} aria-hidden />
            אימונים אחרונים
          </h2>
          <button
            type="button"
            onClick={() => setWorkoutModalOpen(true)}
            className="focus-ring rounded-full px-3 py-1 text-xs text-muted transition-colors hover:text-foreground"
          >
            רישום ידני מפורט
          </button>
        </div>
        {deleteWorkoutError && <p className="mb-2 text-xs text-accent-family">{deleteWorkoutError}</p>}
        {recentWorkouts.length === 0 ? (
          <p className="text-sm text-muted">עוד לא נרשמו אימונים. התחל אימון למעלה או רשום אחד בלחיצה.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recentWorkouts.map((workout, i) => {
              const kind = WORKOUT_KINDS.find((k) => k.kind === workout.kind);
              const minutes = workoutMinutes(workout);
              const calories =
                workout.caloriesBurned ??
                (minutes && workout.kind ? estimateCaloriesBurned(workout.kind, workout.intensity ?? 3, minutes) : null);
              return (
                <motion.li
                  key={workout.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.24) }}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                  className="glass-card group flex flex-col gap-2 rounded-2xl p-3.5 transition-shadow hover:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent-fitness)_10%,transparent)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                      <span aria-hidden>{kind?.emoji ?? "🏅"}</span>
                      <span className="truncate">{workout.title}</span>
                    </p>
                    <button
                      onClick={() => removeWorkout(workout.id).catch(() => undefined)}
                      aria-label={`מחק את ${workout.title}`}
                      className="focus-ring shrink-0 rounded-lg p-1 text-muted opacity-0 transition-[opacity,color] hover:text-accent-family group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </div>
                  <p className="text-[0.7rem] text-muted">
                    <span className="ltr">
                      {new Date(workout.startTime).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })} ·{" "}
                      {formatTime(workout.startTime)}
                    </span>
                    {minutes != null && ` · ${minutes} דק׳`}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem]">
                    {workout.intensity && (
                      <span className="rounded-full bg-accent-fitness/10 px-2 py-0.5 text-accent-fitness">{INTENSITY_LABELS[workout.intensity]}</span>
                    )}
                    {workout.avgHeartRate && (
                      <span className="ltr rounded-full bg-accent-family/10 px-2 py-0.5 text-accent-family">♥ {workout.avgHeartRate}</span>
                    )}
                    {calories != null && <span className="ltr rounded-full bg-fill-subtle px-2 py-0.5 text-muted">~{calories} kcal</span>}
                  </div>
                  {workout.routineDetails && <p className="line-clamp-2 text-[0.7rem] text-foreground/70">{workout.routineDetails}</p>}
                </motion.li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The coaching layer: deterministic nudges, then the AI coach on request.
          Water and energy are no longer nudged in text — they have instruments above. */}
      <GlassCard className="mb-5">
        <WellnessCopilot exclude={["hydration", "mindset"]} />
      </GlassCard>
      <NutritionCoach workouts={todaysWorkouts} meals={todaysMeals} recommendation={recommendation} onRecommendation={setRecommendation} />

      <MealQuickLog open={mealDrawerOpen} onClose={() => setMealDrawerOpen(false)} onLog={addMeal} />
      <NewWorkoutModal open={workoutModalOpen} onClose={() => setWorkoutModalOpen(false)} onCreate={addWorkout} />
    </main>
  );
}
