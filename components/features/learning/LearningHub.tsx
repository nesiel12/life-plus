"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArrowUp, LayoutGrid, List, Network, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { useLearningAudio } from "@/hooks/useLearningAudio";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { CuriosityRadar } from "@/components/features/learning/CuriosityRadar";
import { KnowledgeGraph } from "@/components/features/learning/KnowledgeGraph";
import { TopicCanvasModal } from "@/components/features/learning/TopicCanvasModal";
import { TopicGrid, TopicList } from "@/components/features/learning/TopicGrid";
import { VideoStudyPanel } from "@/components/features/learning/VideoStudyPanel";
import { fireCelebration } from "@/components/features/learning/lab/fx";
import { XpPops, type XpPop } from "@/components/features/learning/lab/FloatingXp";
import { LabContext, type LabApi, type Point } from "@/components/features/learning/lab/LabContext";
import { StreakFlame } from "@/components/features/learning/lab/StreakFlame";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { buildRoll, pickSurpriseTopic } from "@/lib/learning/surprise";
import { filterTopics } from "@/lib/learning/topicSearch";
import { labStats, type Celebration } from "@/lib/learning/xp";
import type { LearningInsights } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

type View = "grid" | "graph" | "list";

const VIEWS: { key: View; label: string; icon: LucideIcon }[] = [
  { key: "grid", label: "רשת", icon: LayoutGrid },
  { key: "graph", label: "מפת ידע", icon: Network },
  { key: "list", label: "רשימה", icon: List },
];

const VIEW_KEY = "lifeplus.learning.view";
const FALLBACK_INSIGHTS: LearningInsights = { streakDays: 0, topicFocus: null, cadencePerWeek: null, nextReview: null, entries: [] };
/** How long the shuffle's chosen topic stays in the spotlight before it opens. */
const SPOTLIGHT_MS = 1700;
const POP_LIFETIME_MS = 1700;

/**
 * מעבדת ידע — the learning space, as one place to explore.
 *
 * It owns the state the parts share (what is searched, which view, which topic is
 * open, what the shuffle is on) and the celebration layer (sound, confetti and
 * the floating "+N XP"), which the parts trigger through LabContext. The three
 * views — grid, map, list — are the same topics in different shapes, tied
 * together by shared layout ids so switching glides rather than cuts.
 *
 * Everything here is derived from the topics and resources already in the store:
 * XP and level are computed, the streak comes from the existing insights route,
 * and nothing new is stored.
 */
export function LearningHub() {
  const topics = useAtlasStore((s) => s.learningTopics);
  const resources = useAtlasStore((s) => s.learningResources);
  const audio = useLearningAudio();
  const reduce = useLabReducedMotion();
  const { data: insights } = useInsights<LearningInsights>("/api/torah/insights", FALLBACK_INSIGHTS);
  const streak = insights?.streakDays ?? 0;

  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const [litId, setLitId] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [pops, setPops] = useState<XpPop[]>([]);
  const [showFreeVideo, setShowFreeVideo] = useState(false);
  const popId = useRef(0);
  const timers = useRef<number[]>([]);

  const stats = useMemo(() => labStats(topics, resources), [topics, resources]);
  const visible = useMemo(() => filterTopics(topics, resources, query), [topics, resources, query]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  // The saved view is read after mount (localStorage is browser-only) and kept.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "grid" || saved === "graph" || saved === "list") setView(saved);
    } catch {
      // The default view is fine.
    }
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  function changeView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembering the view is harmless.
    }
  }

  const celebrate = useCallback(
    (kind: Celebration, xp: number, origin?: Point, label?: string) => {
      audio.play(kind === "level" ? "level-up" : kind === "topic" ? "chime" : "pop");
      // canvas-confetti only honours the operating system's reduced-motion
      // setting; the lab's own answer (which also covers any in-app override)
      // is the one that decides.
      if (!reduce) fireCelebration(kind, origin);
      if (xp > 0) {
        const id = ++popId.current;
        const at = origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        setPops((current) => [...current, { id, amount: xp, x: at.x, y: at.y, label }]);
        schedule(() => setPops((current) => current.filter((p) => p.id !== id)), POP_LIFETIME_MS);
      }
    },
    [audio, schedule, reduce]
  );

  const api = useMemo<LabApi>(
    () => ({ audio, stats, reduceMotion: reduce, celebrate, openTopic: setOpenId }),
    [audio, stats, reduce, celebrate]
  );

  // The slot-machine shuffle: pick the topic first, then roll across the visible
  // cards so the roll can only ever end where the answer is.
  const surprise = useCallback(() => {
    if (rolling || openId || visible.length === 0) return;
    const targetId = pickSurpriseTopic(visible, resources);
    if (!targetId) return;

    audio.prime();
    setRolling(true);

    const land = () => {
      setLitId(targetId);
      audio.play("spotlight");
      setRolling(false);
      // Hold the spotlight a moment, then dig in.
      schedule(() => {
        setLitId(null);
        setOpenId(targetId);
      }, SPOTLIGHT_MS);
    };

    // Reduced motion gets the answer without the flicker of a roll.
    if (reduce) {
      land();
      return;
    }

    const steps = buildRoll(
      visible.length,
      visible.findIndex((t) => t.id === targetId)
    );
    let i = 0;
    const tick = () => {
      const step = steps[i];
      setLitId(visible[step.index].id);
      audio.play("tick", i);
      i++;
      if (i >= steps.length) land();
      else schedule(tick, step.delayMs);
    };
    tick();
  }, [rolling, openId, visible, resources, audio, reduce, schedule]);

  const closeCanvas = useCallback(() => setOpenId(null), []);

  return (
    <LabContext.Provider value={api}>
      <LayoutGroup id="learning-lab">
        <div className="relative">
          <Ambient reduce={reduce} />

          <motion.header
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.7 }}
            className="mb-7 flex flex-wrap items-center justify-between gap-x-8 gap-y-4"
          >
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">מעבדת ידע</h1>
              <p className="mt-1 max-w-md text-sm text-muted">חפש, גלה ולמד — כל צעד צובר XP, ורצף הלמידה שלך עולה באש.</p>
            </div>

            <div className="flex items-center gap-6">
              <StreakFlame days={streak} />

              <div className="flex items-center gap-3">
                <ProgressRing
                  value={stats.levelFraction}
                  size={60}
                  stroke={5}
                  color="var(--gold)"
                  label={`רמה ${stats.level}: ${stats.xpIntoLevel} מתוך ${stats.xpForNext} XP`}
                >
                  <span className="text-center leading-none">
                    <span className="block text-[0.55rem] text-muted">רמה</span>
                    <span className="block text-lg font-bold tabular-nums text-foreground">{stats.level}</span>
                  </span>
                </ProgressRing>
                <div className="leading-tight">
                  <p className="text-lg font-semibold tabular-nums text-gold-ink">
                    <NumberTicker value={stats.xp} /> <span className="text-xs">XP</span>
                  </p>
                  <p className="text-[0.7rem] text-muted">
                    {stats.completedTopics} מתוך {stats.totalTopics} נושאים הושלמו
                  </p>
                </div>
              </div>

              <button
                onClick={audio.toggleMuted}
                aria-pressed={!audio.muted}
                aria-label={audio.muted ? "הפעל צלילים" : "השתק צלילים"}
                className="focus-ring grid size-10 place-items-center rounded-full border border-hairline-card text-muted transition-colors hover:text-foreground"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={audio.muted ? "off" : "on"}
                    initial={reduce ? false : { scale: 0.4, rotate: -60, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={reduce ? undefined : { scale: 0.4, rotate: 60, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  >
                    {audio.muted ? <VolumeX size={17} aria-hidden /> : <Volume2 size={17} aria-hidden />}
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>
          </motion.header>

          <CuriosityRadar
            query={query}
            onQueryChange={setQuery}
            matches={visible}
            onSurprise={surprise}
            rolling={rolling}
            canSurprise={visible.length > 0}
          />

          <div className="mb-5 mt-7 flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="תצוגה" className="flex gap-1 rounded-2xl bg-fill-subtle p-1">
              {VIEWS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => changeView(key)}
                  className={cn(
                    "focus-ring relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm transition-colors",
                    view === key ? "text-foreground" : "text-muted hover:text-foreground"
                  )}
                >
                  {view === key && (
                    <motion.span
                      layoutId="lab-view-pill"
                      className="absolute inset-0 rounded-xl bg-surface shadow-sm"
                      transition={{ type: "spring", visualDuration: 0.35, bounce: 0.2 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon size={15} aria-hidden />
                    {label}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              {query ? `${visible.length} מתוך ${topics.length} נושאים` : `${topics.length} נושאים · ${stats.completedResources}/${stats.totalResources} שלבים`}
            </p>
          </div>

          {topics.length === 0 ? (
            <EmptyState reduce={reduce} />
          ) : visible.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-hairline-card p-10 text-center text-sm text-muted">
              לא נמצאו נושאים תואמים ל&quot;{query}&quot;. לחץ Enter כדי להוסיף אותו כנושא חדש.
            </p>
          ) : (
            <div className="relative">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={view} exit={{ opacity: 0, transition: { duration: 0.18 } }}>
                  {view === "grid" && <TopicGrid topics={visible} resources={resources} litId={litId} onOpen={setOpenId} />}
                  {view === "list" && <TopicList topics={visible} resources={resources} litId={litId} onOpen={setOpenId} />}
                  {view === "graph" && <KnowledgeGraph topics={visible} resources={resources} litId={litId} onOpen={setOpenId} />}
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {/* The old "watch and study a video" panel, kept for a video that isn't a topic. */}
          <div className="mt-12 border-t border-hairline-card pt-5">
            <button
              onClick={() => setShowFreeVideo((v) => !v)}
              aria-expanded={showFreeVideo}
              className="focus-ring rounded-lg px-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              {showFreeVideo ? "הסתר" : "צפה ולמד סרטון בלי לשמור אותו כנושא"}
            </button>
            {showFreeVideo && (
              <div className="mt-4">
                <VideoStudyPanel />
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>{openId && <TopicCanvasModal key={openId} topicId={openId} onClose={closeCanvas} />}</AnimatePresence>
        <XpPops pops={pops} />
      </LayoutGroup>
    </LabContext.Provider>
  );
}

/** Two slow-drifting glows behind the page. Gradients, not blur, and only transforms. */
function Ambient({ reduce }: { reduce: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[34rem] overflow-hidden">
      <motion.div
        className="absolute -start-32 top-0 size-[30rem] rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent-learning) 22%, transparent), transparent 68%)" }}
        animate={reduce ? undefined : { x: [0, 60, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -end-24 top-20 size-[26rem] rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--gold) 20%, transparent), transparent 68%)" }}
        animate={reduce ? undefined : { x: [0, -50, 0], y: [0, -24, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function EmptyState({ reduce }: { reduce: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-hairline-card px-6 py-14 text-center"
    >
      <motion.span
        className="grid size-12 place-items-center rounded-full bg-accent-learning/15 text-accent-learning"
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <ArrowUp size={22} aria-hidden />
      </motion.span>
      <p className="text-base font-medium text-foreground">המעבדה ריקה — בוא נתחיל</p>
      <p className="max-w-sm text-sm text-muted">כתוב נושא ברדאר למעלה, או הדבק קישור ל-YouTube, והוא יהפוך לנושא לימוד עם מסלול משלו.</p>
    </motion.div>
  );
}
