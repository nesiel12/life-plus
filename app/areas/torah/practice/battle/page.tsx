import Link from "next/link";
import { ArrowRight, Swords } from "lucide-react";
import { ChavrutaBattle } from "@/components/features/torah/practice/ChavrutaBattle";

// "קרב חברותא" — the gamified practice session.
export default function TorahPracticeBattlePage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
      <Link
        href="/areas/torah/practice"
        className="focus-ring glass-control-hover mb-5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
      >
        <ArrowRight size={14} aria-hidden />
        לתרגל
      </Link>
      <header className="mb-6">
        <p className="flex items-center gap-1.5 text-xs font-medium text-gold-ink">
          <Swords size={13} aria-hidden />
          לתרגל
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">קרב חברותא</h1>
      </header>
      <ChavrutaBattle />
    </main>
  );
}
