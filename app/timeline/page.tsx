"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Award, Circle, History, Plus, Sparkles, Target, X, type LucideIcon } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { buildTimelineEvents } from "@/lib/timeline/buildTimelineEvents";
import { groupEventsByDate } from "@/lib/timeline/groupEvents";
import type { TimelineEvent } from "@/lib/timeline/types";
import { LIFE_AREA_LIST, momentCategoryColorVar } from "@/lib/lifeAreas";
import { LIFE_AREA_ICONS } from "@/lib/lifeAreaIcons";
import { cn } from "@/lib/utils";
import type { MomentCategory } from "@/types";
import { BackToHome } from "@/components/layout/BackToHome";
import { useT } from "@/lib/i18n/useT";

type FilterValue = MomentCategory | "all";

function iconForEvent(event: TimelineEvent): LucideIcon {
  if (event.kind === "milestone_achieved") return Award;
  if (event.kind === "goal_started") return Target;
  if (event.category === "general") return Circle;
  return LIFE_AREA_ICONS[event.category];
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

// "On this day" — same calendar day (month + date), an earlier year.
function isOnThisDay(iso: string, today: Date): boolean {
  const d = new Date(iso);
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() < today.getFullYear()
  );
}

function yearsAgo(iso: string, today: Date): number {
  return today.getFullYear() - new Date(iso).getFullYear();
}

// ── The Daily Feed ─────────────────────────────────────────────────────────
// The old Timeline was a read-only, date-grouped list. This keeps the same
// pure data pipeline (buildTimelineEvents → groupEventsByDate) but turns it
// into a feed you can act in: capture a moment inline without leaving the
// page, expand a long entry in place, and see what happened on this day in
// past years surfaced at the top.
export default function DailyFeedPage() {
  const t = useT();
  const reduce = useReducedMotion();
  const moments = useAtlasStore((s) => s.moments);
  const goals = useAtlasStore((s) => s.goals);
  const knowledgeEntries = useAtlasStore((s) => s.knowledgeEntries);
  const addMoment = useAtlasStore((s) => s.addMoment);

  const [filter, setFilter] = useState<FilterValue>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [draftCategory, setDraftCategory] = useState<MomentCategory>("general");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const { loading: saving, error: saveError, run: save } = useApiCall(addMoment);

  const events = useMemo(
    () => buildTimelineEvents({ moments, goals, knowledgeEntries }),
    [moments, goals, knowledgeEntries]
  );

  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.category === filter)),
    [events, filter]
  );

  const grouped = useMemo(() => groupEventsByDate(filtered), [filtered]);

  const today = useMemo(() => new Date(), []);
  const onThisDay = useMemo(
    () => events.filter((e) => isOnThisDay(e.timestamp, today)),
    [events, today]
  );

  const stats = useMemo(() => {
    const achievements = events.filter((e) => e.achievement).length;
    const days = new Set(events.map((e) => e.timestamp.slice(0, 10))).size;
    return { total: events.length, achievements, days };
  }, [events]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!draftContent.trim()) return;
    save({
      category: draftCategory,
      title: draftTitle.trim() || "רגע חדש",
      content: draftContent.trim(),
    })
      .then(() => {
        setDraftTitle("");
        setDraftContent("");
        setDraftCategory("general");
        setComposerOpen(false);
      })
      .catch(() => {
        /* saveError renders below */
      });
  }

  let cardIndex = 0;

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-medium tracking-tight">{t("page.timeline.title")}</h1>
          <p className="text-sm text-muted">
            הסיפור של החיים שלך — רגעים, יעדים והישגים במקום אחד.
          </p>
        </div>
        <button
          onClick={() => setComposerOpen((v) => !v)}
          aria-expanded={composerOpen}
          className="focus-ring flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-[var(--background)] transition-opacity hover:opacity-90"
        >
          {composerOpen ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
          {composerOpen ? "סגור" : "רגע חדש"}
        </button>
      </div>

      {events.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-4 text-xs text-muted">
          <span>
            <span className="ltr font-semibold text-foreground tabular-nums">{stats.total}</span> רגעים
          </span>
          <span>
            <span className="ltr font-semibold text-accent-faith tabular-nums">{stats.achievements}</span> הישגים
          </span>
          <span>
            <span className="ltr font-semibold text-foreground tabular-nums">{stats.days}</span> ימים מתועדים
          </span>
        </div>
      )}

      {/* Inline composer — capture a moment without leaving the feed. */}
      <AnimatePresence initial={false}>
        {composerOpen && (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mb-6 overflow-hidden"
          >
            <div className="rounded-2xl border border-hairline-card bg-surface p-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {[{ key: "general" as const, label: "כללי", colorVar: "--muted" }, ...LIFE_AREA_LIST].map(
                  (area) => (
                    <button
                      key={area.key}
                      onClick={() => setDraftCategory(area.key)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        draftCategory === area.key
                          ? "border-transparent text-background"
                          : "border-hairline-card text-muted hover:text-foreground"
                      )}
                      style={
                        draftCategory === area.key
                          ? { backgroundColor: `var(${area.colorVar})` }
                          : undefined
                      }
                    >
                      {area.label}
                    </button>
                  )
                )}
              </div>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="כותרת (אופציונלי)"
                aria-label="כותרת הרגע"
                className="focus-ring mb-2 w-full rounded-lg bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="מה קרה?"
                aria-label="תוכן הרגע"
                rows={3}
                className="focus-ring mb-3 w-full resize-none rounded-lg bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
              {saveError && <p className="mb-2 text-xs text-accent-family">{saveError}</p>}
              <button
                onClick={submit}
                disabled={!draftContent.trim() || saving}
                className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm font-medium text-accent-faith transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                <Plus size={13} aria-hidden />
                {saving ? "שומר…" : "הוסף לפיד"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "On this day" — nostalgia surfaced. */}
      {onThisDay.length > 0 && filter === "all" && (
        <div className="mb-8 rounded-2xl border border-accent-faith/25 bg-accent-faith/[0.06] p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-accent-faith">
            <History size={13} aria-hidden />
            היום לפני
          </p>
          <ul className="flex flex-col gap-2">
            {onThisDay.map((event) => {
              const Icon = iconForEvent(event);
              const y = yearsAgo(event.timestamp, today);
              return (
                <li key={event.id} className="flex items-start gap-2 text-sm">
                  <Icon size={14} className="mt-0.5 shrink-0 text-accent-faith/80" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground">{event.title}</span>
                    <span className="ms-1.5 text-xs text-muted">
                      · לפני {y === 1 ? "שנה" : `${y} שנים`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Filters — sliding pill. */}
      <div className="mb-8 flex flex-wrap gap-2">
        {[{ key: "all" as const, label: "הכל", colorVar: undefined }, ...LIFE_AREA_LIST.map((a) => ({
          key: a.key as FilterValue,
          label: a.label,
          colorVar: a.colorVar,
        }))].map((chip) => {
          const active = filter === chip.key;
          return (
            <button
              key={chip.key}
              onClick={() => setFilter(chip.key)}
              aria-pressed={active}
              className={cn(
                "relative rounded-full border px-3 py-1 text-xs transition-colors",
                active ? "border-transparent text-background" : "border-hairline-card text-muted hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="daily-feed-filter-pill"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 -z-10 rounded-full"
                  style={{ backgroundColor: chip.colorVar ? `var(${chip.colorVar})` : "var(--foreground)" }}
                />
              )}
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* The feed — a spine with dated sections. */}
      <div className="relative flex flex-col gap-9">
        {grouped.length > 0 && (
          <span
            className="pointer-events-none absolute bottom-2 top-2 w-px bg-hairline-card"
            style={{ insetInlineStart: "0.30rem" }}
            aria-hidden
          />
        )}

        {grouped.map((group) => (
          <section key={group.label} className="relative ps-6">
            <span
              className="absolute top-1 size-2.5 rounded-full border-2 border-[var(--background)] bg-muted"
              style={{ insetInlineStart: 0 }}
              aria-hidden
            />
            <h2 className="mb-3 text-xs font-medium tracking-wide text-muted">{group.label}</h2>
            <ol className="flex flex-col gap-3">
              {group.events.map((event) => {
                const Icon = iconForEvent(event);
                const delay = reduce ? 0 : Math.min(cardIndex++ * 0.035, 0.5);
                const isLong = (event.description?.length ?? 0) > 140;
                const isOpen = expanded.has(event.id);
                return (
                  <motion.li
                    key={event.id}
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay, ease: "easeOut" }}
                    className={cn(
                      "rounded-2xl border bg-surface p-4 transition-colors",
                      event.achievement
                        ? "border-accent-faith/30 bg-accent-faith/[0.05]"
                        : "border-hairline-card"
                    )}
                    style={{ borderInlineStartWidth: 3, borderInlineStartColor: `var(${momentCategoryColorVar(event.category)})` }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Icon
                        size={14}
                        className={cn("shrink-0", event.achievement ? "text-accent-faith" : "text-muted")}
                        aria-hidden
                      />
                      <h3 className="min-w-0 flex-1 text-sm font-medium text-foreground">{event.title}</h3>
                      {event.achievement && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent-faith/15 px-2 py-0.5 text-[0.7rem] text-accent-faith">
                          <Sparkles size={9} aria-hidden />
                          הישג
                        </span>
                      )}
                      <span className="ltr shrink-0 text-[0.7rem] tabular-nums text-muted">
                        {timeOfDay(event.timestamp)}
                      </span>
                    </div>
                    {event.description && (
                      <>
                        <p
                          className={cn(
                            "text-sm leading-relaxed text-foreground/80",
                            isLong && !isOpen && "line-clamp-2"
                          )}
                        >
                          {event.description}
                        </p>
                        {isLong && (
                          <button
                            onClick={() => toggle(event.id)}
                            className="focus-ring mt-1 text-xs font-medium text-gold-ink transition-colors hover:text-foreground"
                          >
                            {isOpen ? "הצג פחות" : "הצג עוד"}
                          </button>
                        )}
                      </>
                    )}
                  </motion.li>
                );
              })}
            </ol>
          </section>
        ))}

        {events.length === 0 && (
          <p className="text-sm text-muted">
            אין עדיין רגעים. לחץ &quot;רגע חדש&quot; למעלה, או ⌘K בכל מקום, כדי ללכוד את הראשון.
          </p>
        )}
        {events.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted">אין עדיין רגעים בתחום הזה.</p>
        )}
      </div>
    </main>
  );
}
