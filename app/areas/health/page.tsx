"use client";

import { useMemo, useState } from "react";
import { Apple, Dumbbell, Plus, Trash2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { GlassCard } from "@/components/ui/GlassCard";
import { NewMealModal } from "@/components/features/health/NewMealModal";
import { NewWorkoutModal } from "@/components/features/health/NewWorkoutModal";
import { NutritionCoach } from "@/components/features/health/NutritionCoach";
import type { MealType } from "@/types";

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "ארוחת בוקר",
  lunch: "ארוחת צהריים",
  dinner: "ארוחת ערב",
  snack: "חטיף",
  "post-workout": "לאחר אימון",
};

// Local "is this today" helper, deliberately not imported from
// lib/time/buildDailyTimeline.ts's own selectMealsForDate/
// selectWorkoutsForDate (which do the identical job for the shared Daily
// Timeline on /areas/time) — this page has no other dependency on the
// Time & Tasks Space, and a two-line local equivalent is cheaper than a
// cross-space import for something this small.
function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isToday(iso: string, todayKey: string): boolean {
  return iso.slice(0, 10) === todayKey;
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

// Health & Fitness Space (Phase 8): replaces the previous generic
// AreaMomentsView placeholder with a real feature — meal and workout
// logging, both feeding the shared daily Timeline (lib/time/
// buildDailyTimeline.ts, rendered on /areas/time) as well as this page's
// own dashboard, plus an AI Nutrition Coach that reasons over today's real
// activity. Same "quick-add row + GlassCard list" convention every other
// space (Torah Library, Learning Space) already established.
export default function HealthSpacePage() {
  const meals = useAtlasStore((s) => s.meals);
  const workouts = useAtlasStore((s) => s.workouts);
  const addMeal = useAtlasStore((s) => s.addMeal);
  const deleteMeal = useAtlasStore((s) => s.deleteMeal);
  const addWorkout = useAtlasStore((s) => s.addWorkout);
  const deleteWorkout = useAtlasStore((s) => s.deleteWorkout);

  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [recommendation, setRecommendation] = useState<NutritionRecommendation | null>(null);

  const { error: deleteMealError, run: removeMeal } = useApiCall(deleteMeal);
  const { error: deleteWorkoutError, run: removeWorkout } = useApiCall(deleteWorkout);

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const todaysMeals = useMemo(() => meals.filter((m) => isToday(m.eatenAt, todayKey)), [todayKey, meals]);
  const todaysWorkouts = useMemo(
    () => workouts.filter((w) => isToday(w.startTime, todayKey)),
    [todayKey, workouts]
  );

  function handleDeleteMeal(mealId: string) {
    removeMeal(mealId).catch(() => {
      // error is already captured in deleteMealError for display below
    });
  }

  function handleDeleteWorkout(workoutId: string) {
    removeWorkout(workoutId).catch(() => {
      // error is already captured in deleteWorkoutError for display below
    });
  }

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">בריאות</h1>
      <p className="mb-8 text-sm text-muted">ארוחות, אימונים, והדרכה תזונתית מבוססת AI — הכל במקום אחד.</p>

      <div className="mb-6">
        <NutritionCoach
          workouts={todaysWorkouts}
          meals={todaysMeals}
          recommendation={recommendation}
          onRecommendation={setRecommendation}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted">ארוחות היום ({todaysMeals.length})</h2>
            <button
              onClick={() => setMealModalOpen(true)}
              className="focus-ring flex items-center gap-1 rounded-lg bg-accent-fitness/20 px-3 py-1.5 text-xs font-medium text-accent-fitness transition-opacity hover:opacity-80"
            >
              <Plus size={12} aria-hidden />
              רשום ארוחה
            </button>
          </div>

          {deleteMealError && <p className="mb-2 text-xs text-accent-family">{deleteMealError}</p>}

          <div className="flex flex-col gap-3">
            {todaysMeals.map((meal, i) => (
              <GlassCard key={meal.id} delay={Math.min(i * 0.05, 0.3)} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Apple size={14} className="shrink-0 text-accent-fitness" aria-hidden />
                      <span className="truncate text-sm font-medium text-foreground">{meal.description}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-accent-fitness/15 px-2 py-0.5 text-[10px] text-accent-fitness">
                        {MEAL_TYPE_LABEL[meal.type]}
                      </span>
                      <span className="ltr rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">
                        {formatTime(meal.eatenAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteMeal(meal.id)}
                    aria-label={`מחק את ${meal.description}`}
                    className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              </GlassCard>
            ))}
            {todaysMeals.length === 0 && (
              <p className="text-sm text-muted">עדיין לא נרשמו ארוחות היום. רשום את הראשונה למעלה.</p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted">אימונים ({workouts.length})</h2>
            <button
              onClick={() => setWorkoutModalOpen(true)}
              className="focus-ring flex items-center gap-1 rounded-lg bg-accent-fitness/20 px-3 py-1.5 text-xs font-medium text-accent-fitness transition-opacity hover:opacity-80"
            >
              <Plus size={12} aria-hidden />
              רשום אימון
            </button>
          </div>

          {deleteWorkoutError && <p className="mb-2 text-xs text-accent-family">{deleteWorkoutError}</p>}

          <div className="flex flex-col gap-3">
            {workouts.map((workout, i) => (
              <GlassCard key={workout.id} delay={Math.min(i * 0.05, 0.3)} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Dumbbell size={14} className="shrink-0 text-accent-fitness" aria-hidden />
                      <span className="truncate text-sm font-medium text-foreground">{workout.title}</span>
                    </div>
                    <p className="ltr mt-1 text-xs text-muted">
                      {new Date(workout.startTime).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                      {" · "}
                      {formatTime(workout.startTime)}
                      {workout.endTime ? `–${formatTime(workout.endTime)}` : ""}
                    </p>
                    {workout.routineDetails && (
                      <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">{workout.routineDetails}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteWorkout(workout.id)}
                    aria-label={`מחק את ${workout.title}`}
                    className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              </GlassCard>
            ))}
            {workouts.length === 0 && (
              <p className="text-sm text-muted">עדיין לא נרשמו אימונים. רשום את הראשון למעלה.</p>
            )}
          </div>
        </section>
      </div>

      <NewMealModal open={mealModalOpen} onClose={() => setMealModalOpen(false)} onCreate={addMeal} />
      <NewWorkoutModal open={workoutModalOpen} onClose={() => setWorkoutModalOpen(false)} onCreate={addWorkout} />
    </main>
  );
}
