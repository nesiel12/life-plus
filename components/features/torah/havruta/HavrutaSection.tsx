"use client";

import Link from "next/link";
import { GraduationCap, Loader2, Maximize2, RotateCcw, Swords } from "lucide-react";
import { PageSection } from "@/components/features/torah/hub/PageSection";
import { HavrutaChat } from "@/components/features/torah/havruta/HavrutaChat";
import { useHavruta } from "@/components/features/torah/havruta/useHavruta";
import { cn } from "@/lib/utils";
import type { HavrutaMode, HavrutaSubjectType } from "@/lib/torah/havruta";

interface HavrutaSectionProps {
  subjectType: Extract<HavrutaSubjectType, "book" | "lesson" | "rabbi">;
  subjectId: string;
  subjectTitle: string;
  delay?: number;
  className?: string;
}

const MODES: { mode: Exclude<HavrutaMode, "contradiction">; label: string; icon: typeof Swords; hint: string }[] = [
  { mode: "debate", label: "מצב פלפול", icon: Swords, hint: "הקשה עליי והבא שיטות חולקות" },
  { mode: "clarify", label: "בחן את הבנתי", icon: GraduationCap, hint: "שאלות, רמזים ובדיקת הבנה" },
];

/**
 * "חברותא AI" on a Book or Lesson page.
 *
 * Opens nothing until the learner picks a mode — a page visit must not create
 * a thread row. Once open, the conversation is the same component the full
 * discussion page uses, with a link to continue there.
 */
export function HavrutaSection({ subjectType, subjectId, subjectTitle, delay, className }: HavrutaSectionProps) {
  const havruta = useHavruta();
  const { session, loading } = havruta;
  const activeMode = session?.thread.mode;

  return (
    <PageSection
      id="havruta"
      icon={Swords}
      tone="family"
      title="חברותא AI"
      subtitle={`לימוד בזוגות על ${subjectTitle} — קושיות, שיטות חולקות ומקורות מאומתים`}
      delay={delay}
      className={className}
      action={
        session ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void havruta.open(subjectType, subjectId, session.thread.mode as HavrutaMode, true)}
              className="focus-ring flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
            >
              <RotateCcw size={12} aria-hidden />
              דיון חדש
            </button>
            <Link
              href={`/areas/torah/havruta/${session.thread.id}`}
              className="focus-ring flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
            >
              <Maximize2 size={12} aria-hidden />
              מסך מלא
            </Link>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="מצב החברותא" className="grid gap-2 sm:grid-cols-2">
          {MODES.map(({ mode, label, icon: Icon, hint }) => {
            const selected = activeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={loading}
                onClick={() => {
                  if (!selected) void havruta.open(subjectType, subjectId, mode);
                }}
                className={cn(
                  "focus-ring flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start transition-colors disabled:opacity-60",
                  selected ? "border-gold-line bg-gold-soft/70" : "border-hairline-card bg-surface hover:border-gold-line"
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    selected ? "bg-gold text-white" : "bg-fill-subtle text-muted"
                  )}
                  aria-hidden
                >
                  <Icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {loading && !session && (
          <p className="flex items-center gap-2 text-xs text-muted" role="status">
            <Loader2 size={13} className="animate-spin" aria-hidden />
            פותח את החברותא…
          </p>
        )}
        {!session && havruta.error && <p className="text-xs text-accent-family">{havruta.error}</p>}

        {session && (
          <HavrutaChat
            session={session}
            pending={havruta.pending}
            summarizing={havruta.summarizing}
            error={havruta.error}
            onSend={havruta.send}
            onSummarize={() => void havruta.summarize()}
            compact
          />
        )}
      </div>
    </PageSection>
  );
}
