"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowRight, Loader2, Swords, Trash2 } from "lucide-react";
import { HavrutaChat } from "@/components/features/torah/havruta/HavrutaChat";
import { useHavruta } from "@/components/features/torah/havruta/useHavruta";
import { SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { HAVRUTA_MODE_LABELS } from "@/lib/torah/havruta";

/** A Havruta discussion on its own page — any subject, including a contradiction. */
export function HavrutaPage({ threadId }: { threadId: string }) {
  const router = useRouter();
  const havruta = useHavruta();
  const { session, load } = havruta;
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void load(threadId);
  }, [load, threadId]);

  if (!session) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
        {havruta.loading || !havruta.error ? (
          <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            טוען את הדיון…
          </p>
        ) : (
          <SectionPlaceholder icon={Swords} title="הדיון לא נמצא" body={havruta.error ?? undefined} />
        )}
      </main>
    );
  }

  const { thread, subject } = session;

  return (
    <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={session.subjectHref ?? "/areas/torah"}
          className="focus-ring glass-control-hover inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
        >
          <ArrowRight size={14} aria-hidden />
          {session.subjectHref ? subject.title : "מרחב תורה"}
        </Link>
        <button
          type="button"
          disabled={deleting}
          onClick={async () => {
            if (!window.confirm("למחוק את הדיון הזה?")) return;
            setDeleting(true);
            await fetch(`/api/torah/havruta/${thread.id}`, { method: "DELETE" }).catch(() => null);
            router.push(session.subjectHref ?? "/areas/torah");
          }}
          className="focus-ring inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-accent-family"
        >
          <Trash2 size={13} aria-hidden />
          מחק דיון
        </button>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-gold-ink">
            <Swords size={13} aria-hidden />
            חברותא AI · {HAVRUTA_MODE_LABELS[thread.mode]}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{subject.title}</h1>
          {subject.byline && <p className="text-sm text-muted">{subject.byline}</p>}
        </header>

        {subject.contradiction && (
          <section className="glass-card rounded-2xl p-5" aria-label="שני צדי הסתירה">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
              <blockquote className="rounded-xl bg-surface-sunken/70 p-3.5">
                <p className="mb-1 text-xs font-medium text-gold-ink">{subject.contradiction.left.label}</p>
                <p className="text-sm leading-relaxed text-foreground/85">{subject.contradiction.left.excerpt}</p>
              </blockquote>
              <span className="grid place-items-center text-accent-family" aria-hidden>
                <ArrowLeftRight size={18} />
              </span>
              <blockquote className="rounded-xl bg-surface-sunken/70 p-3.5">
                <p className="mb-1 text-xs font-medium text-gold-ink">{subject.contradiction.right.label}</p>
                <p className="text-sm leading-relaxed text-foreground/85">{subject.contradiction.right.excerpt}</p>
              </blockquote>
            </div>
            <p className="mt-3 text-sm text-foreground/80">{subject.contradiction.explanation}</p>
          </section>
        )}

        <section className="glass-card rounded-2xl p-5 sm:p-6" aria-label="הדיון">
          <HavrutaChat
            session={session}
            pending={havruta.pending}
            summarizing={havruta.summarizing}
            error={havruta.error}
            onSend={havruta.send}
            onSummarize={() => void havruta.summarize()}
          />
        </section>
      </div>
    </main>
  );
}
