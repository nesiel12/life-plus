"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { transactionsRepo } from "@/lib/db/transactions";
import { toTransaction, toTransactionPatch } from "@/lib/mappers";
import type { Transaction, TransactionType } from "@/types";

export async function addTransactionAction(input: {
  amount: number;
  type: TransactionType;
  title: string;
  category: string;
  date?: string;
  note?: string;
  isShift?: boolean;
  hourlyRate?: number;
  shiftStart?: string;
  shiftEnd?: string;
  employer?: string;
  isRecurring?: boolean;
}) {
  const userId = await getCurrentUserId();
  const row = await transactionsRepo.insert({
    user_id: userId,
    amount: input.amount,
    type: input.type,
    title: input.title,
    category: input.category,
    transaction_date: input.date,
    note: input.note ?? null,
    is_shift: input.isShift ?? false,
    hourly_rate: input.hourlyRate ?? null,
    shift_start: input.shiftStart ?? null,
    shift_end: input.shiftEnd ?? null,
    employer: input.employer ?? null,
    is_recurring: input.isRecurring ?? false,
  });
  return toTransaction(row);
}

export async function updateTransactionAction(transactionId: string, patch: Partial<Transaction>) {
  const userId = await getCurrentUserId();
  const row = await transactionsRepo.update(userId, transactionId, toTransactionPatch(patch));
  return toTransaction(row);
}

export async function deleteTransactionAction(transactionId: string) {
  const userId = await getCurrentUserId();
  await transactionsRepo.remove(userId, transactionId);
}
