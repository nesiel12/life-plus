"use client";

import { useMemo, useState } from "react";
import { Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { GlassCard } from "@/components/ui/GlassCard";
import { TransactionRow } from "@/components/features/finances/TransactionRow";
import { NewTransactionModal } from "@/components/features/finances/NewTransactionModal";
import { CfoPanel } from "@/components/features/finances/CfoPanel";
import { StatementImport } from "@/components/features/finances/StatementImport";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/types";
import { BackToHome } from "@/components/layout/BackToHome";

function formatDateHeading(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.abs(amount).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Finances Space (Phase 6): single currency (ILS, no currency field), a
// live summary row (total balance + this month's income/expenses,
// derived from the store, never a separate stored total), a date-grouped
// transaction list, and an add-transaction modal.
export default function FinancesSpacePage() {
  const transactions = useAtlasStore((s) => s.transactions);
  const addTransaction = useAtlasStore((s) => s.addTransaction);
  const deleteTransaction = useAtlasStore((s) => s.deleteTransaction);

  const [modalOpen, setModalOpen] = useState(false);
  const { error: deleteError, run: removeTransaction } = useApiCall(deleteTransaction);

  const summary = useMemo(() => {
    const monthKey = currentMonthKey();
    let totalBalance = 0;
    let incomeThisMonth = 0;
    let expensesThisMonth = 0;

    for (const tx of transactions) {
      totalBalance += tx.type === "income" ? tx.amount : -tx.amount;
      if (tx.date.slice(0, 7) === monthKey) {
        if (tx.type === "income") incomeThisMonth += tx.amount;
        else expensesThisMonth += tx.amount;
      }
    }

    return { totalBalance, incomeThisMonth, expensesThisMonth };
  }, [transactions]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const existing = groups.get(tx.date);
      if (existing) existing.push(tx);
      else groups.set(tx.date, [tx]);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [transactions]);

  function handleDelete(transactionId: string) {
    removeTransaction(transactionId).catch(() => {
      // error is already captured in deleteError for display below
    });
  }

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
            <GlassCard className="mb-6">
        <CfoPanel />
      </GlassCard>

      <GlassCard className="mb-6">
        <StatementImport />
      </GlassCard>

<div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-medium tracking-tight">כספים</h1>
          <p className="text-sm text-muted">מעקב אחר הכנסות והוצאות שלך.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-finance/20 px-4 py-2 text-sm font-medium text-accent-finance transition-opacity hover:opacity-80"
        >
          <Plus size={14} aria-hidden />
          הוספת תנועה
        </button>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard delay={0} className="p-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
            <Wallet size={13} aria-hidden />
            יתרה כוללת
          </div>
          <p className={cn("ltr text-xl font-medium", summary.totalBalance >= 0 ? "text-accent-finance" : "text-accent-family")}>
            {formatCurrency(summary.totalBalance)}
          </p>
        </GlassCard>
        <GlassCard delay={0.05} className="p-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
            <TrendingUp size={13} aria-hidden />
            הכנסות החודש
          </div>
          <p className="ltr text-xl font-medium text-accent-finance">{formatCurrency(summary.incomeThisMonth)}</p>
        </GlassCard>
        <GlassCard delay={0.1} className="p-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
            <TrendingDown size={13} aria-hidden />
            הוצאות החודש
          </div>
          <p className="ltr text-xl font-medium text-accent-family">{formatCurrency(summary.expensesThisMonth)}</p>
        </GlassCard>
      </div>

      {deleteError && <p className="mb-6 text-xs text-accent-family">{deleteError}</p>}

      {groupedByDate.length === 0 ? (
        <p className="text-sm text-muted">אין עדיין עסקאות. הוסף את הראשונה כדי להתחיל לעקוב.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedByDate.map(([date, txs]) => (
            <div key={date}>
              <h2 className="mb-3 text-sm font-medium text-muted">{formatDateHeading(date)}</h2>
              <div className="flex flex-col gap-2">
                {txs.map((tx, i) => (
                  <TransactionRow key={tx.id} transaction={tx} delay={Math.min(i * 0.04, 0.2)} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewTransactionModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={addTransaction} />
    </main>
  );
}
