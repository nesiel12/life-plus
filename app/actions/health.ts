"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { mealsRepo, workoutsRepo } from "@/lib/db/health";
import { toMeal, toMealPatch, toWorkout, toWorkoutPatch } from "@/lib/mappers";
import type { Meal, MealType, Workout } from "@/types";

export async function addMealAction(input: {
  description: string;
  type: MealType;
  eatenAt?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
}) {
  const userId = await getCurrentUserId();
  const row = await mealsRepo.insert({
    user_id: userId,
    description: input.description,
    type: input.type,
    eaten_at: input.eatenAt,
    calories: input.calories ?? null,
    protein_g: input.protein ?? null,
    carbs_g: input.carbs ?? null,
    fats_g: input.fats ?? null,
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

export async function addWorkoutAction(input: {
  title: string;
  startTime?: string;
  endTime?: string;
  routineDetails?: string;
}) {
  const userId = await getCurrentUserId();
  const row = await workoutsRepo.insert({
    user_id: userId,
    title: input.title,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    routine_details: input.routineDetails ?? null,
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
