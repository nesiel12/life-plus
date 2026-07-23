"use client";

import { motion } from "framer-motion";
import { CalendarClock, CalendarHeart } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { ScheduleSuggestions } from "@/components/features/ScheduleSuggestions";
import { daysUntil } from "@/lib/utils";

// Smart Calendar (UI/UX Revamp): a real page, not a placeholder — the same
// AI schedule-suggestion pipeline (ScheduleSuggestions, already fetches its
// own data from app/api/calendar/suggestions) that used to only appear on
// Today, plus the "meaningful moments coming up" list, reused as-is rather
// than reimplemented. Today keeps its own lighter view; this is the deeper
// one for anyone who actually came here to look at their schedule.
export default function CalendarPage() {
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);

  return (
    <main className="hero-gradient relative mx-auto min-h-screen max-w-3xl px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mb-10"
      >
        <p className="mb-2 flex items-center gap-2 text-sm text-muted">
          <CalendarClock size={16} className="text-accent-career" aria-hidden />
          יומן חכם
        </p>
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">מה עומד לקרות</h1>
        <p className="mt-2 text-muted">הצעות זמן מבוססות על היומן האמיתי שלך, ורגעים משמעותיים שבדרך.</p>
      </motion.div>

      <div className="flex flex-col gap-6">
        <ScheduleSuggestions />

        <GlassCard delay={0.15}>
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
            <CalendarHeart size={16} className="text-accent-family" aria-hidden />
            רגעים משמעותיים בקרוב
          </p>
          {upcomingEvents.length === 0 ? (
            <p className="text-xs text-muted">אין כרגע רגעים מתוזמנים.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {upcomingEvents.map((event) => {
                const diff = daysUntil(event.date);
                const label =
                  diff === 0 ? "היום" : diff === 1 ? "מחר" : diff > 1 ? `בעוד ${diff} ימים` : "עבר";
                return (
                  <li key={event.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-foreground/90">
                      <CalendarHeart size={16} className="text-accent-family" />
                      {event.title}
                      <span className="text-xs text-muted">· {categoryLabel(event.category)}</span>
                    </span>
                    <span className="ltr text-xs text-muted">{label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </div>
    </main>
  );
}
