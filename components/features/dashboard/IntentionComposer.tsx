"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Check, ListTodo, Loader2, PenLine, Sparkles } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { blocksFrom, parseIntention, tasksFrom } from "@/lib/intentions/parseIntention";
import { cn } from "@/lib/utils";

// The Daily Intention, upgraded from a note into an execution surface.
//
// The parse is deterministic and instant (lib/intentions/parseIntention.ts),
// so what will be created is shown *before* anything is written. That
// preview-then-confirm step is deliberate: this writes real tasks and real
// calendar blocks, and a parser that silently created five items from a
// sentence the user was still editing would be worse than no parser. The
// same propose-then-confirm contract every other write path in this app
// follows.
export function IntentionComposer() {
  const todayIntention = useAtlasStore((s) => s.todayIntention);
  const setTodayIntention = useAtlasStore((s) => s.setTodayIntention);
  const addTask = useAtlasStore((s) => s.addTask);
  const addManualEvent = useAtlasStore((s) => s.addManualEvent);

  const [draft, setDraft] = useState(todayIntention);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recomputed as they type, but only rendered once they ask to preview —
  // parsing is cheap enough to run eagerly and it keeps the counts honest.
  const parsed = useMemo(() => parseIntention(draft, new Date()), [draft]);
  const tasks = tasksFrom(parsed);
  const blocks = blocksFrom(parsed);
  const hasItems = parsed.items.length > 0;

  async function commit() {
    setSaving(true);
    setError(null);
    try {
      // The intention text itself is still saved — the parse augments it,
      // it does not replace the person's own words.
      await setTodayIntention(draft);

      for (const task of tasks) {
        await addTask({ title: task.title });
      }
      for (const block of blocks) {
        const start = new Date(`${block.start}:00`);
        const end = new Date(start.getTime() + block.durationMinutes * 60_000);
        await addManualEvent({
          title: block.title,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });
      }

      setCreated(parsed.items.length);
      setPreviewing(false);
    } catch {
      setError("חלק מהפריטים לא נשמרו. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
        <PenLine size={16} className="text-gold-ink" aria-hidden />
        הכוונה של היום
      </p>

      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setCreated(null);
        }}
        onBlur={() => setTodayIntention(draft)}
        placeholder="על מה תרצה להתמקד היום? אפשר לכתוב רשימה — נהפוך אותה למשימות ולזמנים ביומן."
        aria-label="הכוונה של היום"
        rows={4}
        className="focus-ring w-full min-h-[6.5rem] flex-1 resize-none rounded-xl border border-hairline-card bg-surface-sunken/70 px-3.5 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted"
      />

      {created !== null && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-accent-health">
          <Check size={12} aria-hidden />
          נוצרו {created} פריטים מההכוונה שלך.
        </p>
      )}

      {error && <p className="mt-3 text-xs text-accent-family">{error}</p>}

      {hasItems && !previewing && created === null && (
        <button
          onClick={() => setPreviewing(true)}
          className="glass-control focus-ring mt-3 flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground"
        >
          <Sparkles size={12} className="text-gold-ink" aria-hidden />
          הפוך ל-{parsed.items.length} פריטים
        </button>
      )}

      {previewing && (
        <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-hairline-card bg-surface-sunken/60 p-3.5">
          <p className="text-xs text-muted">זה מה שייווצר — אפשר לאשר או לבטל:</p>

          <ul className="flex flex-col gap-1.5">
            {blocks.map((block) => (
              <li key={`b-${block.title}-${block.start}`} className="flex items-center gap-2 text-xs">
                <CalendarClock size={12} className="shrink-0 text-accent-time" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">{block.title}</span>
                <span className="ltr shrink-0 tabular-nums text-muted">{block.start.slice(11)}</span>
              </li>
            ))}
            {tasks.map((task) => (
              <li key={`t-${task.title}`} className="flex items-center gap-2 text-xs">
                <ListTodo size={12} className="shrink-0 text-accent-learning" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">{task.title}</span>
                <span className="shrink-0 text-muted">משימה</span>
              </li>
            ))}
          </ul>

          {/* Fragments the parser could not use, shown rather than dropped —
              the user should know what was ignored. */}
          {parsed.unparsed.length > 0 && (
            <p className="text-xs text-muted">לא זוהו: {parsed.unparsed.join(", ")}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={commit}
              disabled={saving}
              className={cn(
                "glass-control focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground",
                saving && "opacity-60"
              )}
            >
              {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Check size={12} aria-hidden />}
              {saving ? "יוצר…" : "אשר וצור"}
            </button>
            <button
              onClick={() => setPreviewing(false)}
              className="focus-ring rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
