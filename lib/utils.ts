import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysUntil(dateISO: string): number {
  const target = startOfDay(new Date(dateISO));
  const today = startOfDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function daysSince(dateISO: string): number {
  return -daysUntil(dateISO);
}

export function daysUntilNextBirthday(mmdd: string): number | null {
  const [month, day] = mmdd.split("-").map(Number);
  if (!month || !day) return null;

  const today = startOfDay(new Date());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}
