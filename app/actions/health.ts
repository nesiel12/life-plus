"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { mealsRepo, workoutsRepo } from "@/lib/db/health";
import { toMeal, toMealPatch, toWorkout, toWorkoutPatch } from "@/lib/mappers";
import type { MacroSource, Meal, MealType, Workout, WorkoutKind } from "@/types";

export interface NewMealInput {
  description: string;
  type: MealType;
  eatenAt?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  macroSource?: MacroSource;
}

export async function addMealAction(input: NewMealInput) {
  const userId = await getCurrentUserId();
  const row = await mealsRepo.insert({
    user_id: userId,
    description: input.description,
    type: input.type,
    eaten_at: input.eatenAt,
    calories: input.calories ?? null,
    protein_g: input.proteinG ?? null,
    carbs_g: input.carbsG ?? null,
    fat_g: input.fatG ?? null,
    macro_source: input.macroSource ?? null,
  });
  return toMeal(row);
}

export async function updateMealAction(mealId: string, patch: Partial<Meal>) {
  const userId = await getCurrentUserId();
  const row = await mealsRepo.update(userId, mealId, toMealPatch(patch));
  return toMeal(row);
}

export async function deleteMealAction(mealId: string) {
  const userId = await getCurrentUserId();
  await mealsRepo.remove(userId, mealId);
}

export interface NewWorkoutInput {
  title: string;
  startTime?: string;
  endTime?: string;
  routineDetails?: string;
  kind?: WorkoutKind;
  intensity?: number;
  avgHeartRate?: number;
  caloriesBurned?: number;
}

export async function addWorkoutAction(input: NewWorkoutInput) {
  const userId = await getCurrentUserId();
  const row = await workoutsRepo.insert({
    user_id: userId,
    title: input.title,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    routine_details: input.routineDetails ?? null,
    kind: input.kind ?? null,
    intensity: input.intensity ?? null,
    avg_heart_rate: input.avgHeartRate ?? null,
    calories_burned: input.caloriesBurned ?? null,
  });
  return toWorkout(row);
}

export async function updateWorkoutAction(workoutId: string, patch: Partial<Workout>) {
  const userId = await getCurrentUserId();
  const row = await workoutsRepo.update(userId, workoutId, toWorkoutPatch(patch));
  return toWorkout(row);
}

export async function deleteWorkoutAction(workoutId: string) {
  const userId = await getCurrentUserId();
  await workoutsRepo.remove(userId, workoutId);
}
