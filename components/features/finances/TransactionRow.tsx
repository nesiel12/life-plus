"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/types";

interface TransactionRowProps {
  transaction: Transaction;
  delay: number;
  onDelete: (transactionId: string) => void;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TransactionRow({ transaction, delay, onDelete }: TransactionRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isIncome = transaction.type === "income";
  const Icon = isIncome ? ArrowUpCircle : ArrowDownCircle;

  function handleDeleteClick() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete(transaction.id);
  }

  return (
    <GlassCard delay={delay} className="flex items-center gap-3 p-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isIncome ? "bg-accent-finance/15 text-accent-finance" : "bg-accent-family/15 text-accent-family"
        )}
      >
        <Icon size={16} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{transaction.title}</p>
          <span className="shrink-0 rounded-full bg-fill-subtle px-1.5 py-0.5 text-[10px] text-muted">{transaction.category}</span>
        </div>
        {transaction.note && <p className="truncate text-xs text-muted">{transaction.note}</p>}
      </div>

      <span className={cn("ltr shrink-0 text-sm font-medium", isIncome ? "text-accent-finance" : "text-accent-family")}>
        {isIncome ? "+" : "-"}
        {formatAmount(transaction.amount)} ₪
      </span>

      {confirmingDelete ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex shrink-0 items-center gap-1.5 text-xs"
        >
          <button
            onClick={handleDeleteClick}
            className="focus-ring rounded-lg bg-accent-family/20 px-2 py-1 font-medium text-accent-family transition-opacity hover:opacity-80"
          >
            מחק
          </button>
          <button
            onClick={() => setConfirmingDelete(false)}
            className="focus-ring text-muted transition-colors hover:text-foreground"
          >
            ביטול
          </button>
        </motion.div>
      ) : (
        <button
          onClick={handleDeleteClick}
          aria-label={`מחק את העסקה ${transaction.title}`}
          className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      )}
    </GlassCard>
  );
}
