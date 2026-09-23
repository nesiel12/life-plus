"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  Lightbulb,
  Map as MapIcon,
  ShoppingBag,
  Sparkles,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { useLearningAudio } from "@/hooks/useLearningAudio";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { TopicsMapTab } from "@/components/features/learning/TopicsMapTab";
import { DiscoveryTab } from "@/components/features/learning/DiscoveryTab";
import { LibraryTab } from "@/components/features/learning/LibraryTab";
import { MasteryTab } from "@/components/features/learning/MasteryTab";
import { FeynmanTab } from "@/components/features/learning/FeynmanTab";
import { TopicCanvasModal } from "@/components/features/learning/TopicCanvasModal";
import { fireCelebration } from "@/components/features/learning/lab/fx";
import { XpPops, type XpPop } from "@/components/features/learning/lab/FloatingXp";
import { Portal } from "@/components/features/learning/lab/Portal";
import { LabContext, type LabApi, type Point } from "@/components/features/learning/lab/LabContext";
import { StreakFlame } from "@/components/features/learning/lab/StreakFlame";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { LifePlusShopModal } from "@/components/features/learning/shop/LifePlusShopModal";
import { ParticleTrailCanvas } from "@/components/features/learning/shop/ParticleTrailCanvas";
import { getShopStateAction } from "@/app/actions/xpShop";
import { shopItemById } from "@/lib/learning/xpShop";
import { labStats, type Celebration } from "@/lib/learning/xp";
import type { LearningInsights } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

export type LabTab = "map" | "discovery" | "library" | "mastery" | "feynman";

const TABS: { key: LabTab; label: string; icon: LucideIcon }[] = [
  { key: "map", label: "מפת ידע ונושאים", icon: MapIcon },
  { key: "discovery", label: "הצעות למידה", icon: Sparkles },
  { key: "library", label: "ספרייה וספרים", icon: BookOpen },
  { key: "mastery", label: "מבחנים ושליטה", icon: Brain },
  { key: "feynman", label: "מעבדת פיינמן", icon: Lightbulb },
];

const TAB_KEY = "lifeplus.learning.tab";
const FALLBACK_INSIGHTS: LearningInsights = { streakDays: 0, topicFocus: null, cadencePerWeek: null, nextReview: null, entries: [] };
const POP_LIFETIME_MS = 1700;

function readInitialTab(): LabTab {
  try {
    const params = new URLSearchParams(window.location.search);
    // A deep link always wins: someone followed a QR code or a link to a
    // specific topic, they did not ask to browse the tab they last left open.
    if (params.get("open")) return "map";
    const saved = localStorage.getItem(TAB_KEY);
    if (TABS.some((t) => t.key === saved)) return saved as LabTab;
  } catch {
    // The default tab is fine.
  }
  return "map";
}

/**
 * מעבדת ידע — the learning space, as one place to explore.
 *
 * It owns the state every tab shares (XP/level/streak, the celebration layer,
 * which topic canvas is open) through LabContext, and the top-level tab bar
 * that switches between the five specialised spaces. Each tab owns only its
 * own content; none of them re-derives XP, re-plays a sound, or re-implements
 * the topic canvas.
 *
 * Everything here is derived from data already in the store or fetched on
 * demand: XP and level are computed, the streak comes from the existing
 * insights route, and nothing new about the *lab itself* is stored — only the
 * new entities each tab introduces (books, quotes, quiz history, flashcards)
 * are real, persisted rows (see lib/db/learningBooks.ts and friends).
 */
export function LearningHub() {
  const topics = useAtlasStore((s) => s.learningTopics);
  const resources = useAtlasStore((s) => s.learningResources);
  const audio = useLearningAudio();
  const reduce = useLabReducedMotion();
  const { data: insights } = useInsights<LearningInsights>("/api/torah/insights", FALLBACK_INSIGHTS);
  const streak = insights?.streakDays ?? 0;

  const [tab, setTab] = useState<LabTab>("map");
  const [openId, setOpenId] = useState<string | null>(null);
  const [pops, setPops] = useState<XpPop[]>([]);
  const popId = useRef(0);
  const timers = useRef<number[]>([]);

  // The XP Shop's owned/equipped state — fetched once here (not per-tab)
  // since the badge chips and the particle trail canvas both live at this
  // level, above every tab. purchaseItemAction/setActiveParticleTrailAction
  // (called from the shop modal) are what actually keep this in sync; this
  // effect only covers the initial load.
  const [shopOpen, setShopOpen] = useState(false);
  const [ownedBadgeNames, setOwnedBadgeNames] = useState<string[]>([]);
  const [activeTrail, setActiveTrail] = useState<string | null>(null);
  useEffect(() => {
    void getShopStateAction().then((state) => {
      setOwnedBadgeNames(state.ownedItemIds.map((id) => shopItemById(id)).filter((item) => item?.category === "badge").map((item) => item!.name));
      setActiveTrail(state.activeParticleTrail);
    });
  }, []);

  const stats = useMemo(() => labStats(topics, resources), [topics, resources]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  // The saved tab (or a deep link's ?open=<topicId>) is read after mount —
  // both need the browser (localStorage, location.search).
  useEffect(() => {
    setTab(readInitialTab());
    try {
      const openParam = new URLSearchParams(window.location.search).get("open");
      if (openParam) setOpenId(openParam);
    } catch {
      // No deep link to honour.
    }
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  function changeTab(next: LabTab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Not remembering the tab is harmless.
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
              {ownedBadgeNames.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ownedBadgeNames.map((name) => (
                    <span key={name} className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-medium text-gold-ink">
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <StreakFlame days={streak} />

              <button
                onClick={() => setShopOpen(true)}
                aria-label="חנות Life Plus"
                title="חנות Life Plus"
                className="focus-ring flex items-center gap-1.5 rounded-full border border-hairline-card px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent-learning/30 hover:text-foreground"
              >
                <ShoppingBag size={14} aria-hidden />
                חנות
              </button>

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

          <nav
            role="tablist"
            aria-label="מרחבי הלמידה"
            className="mb-8 flex flex-wrap gap-1.5 rounded-2xl border border-hairline-card bg-surface/70 p-1.5"
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => changeTab(key)}
                className={cn(
                  "focus-ring relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-4",
                  tab === key ? "text-background" : "text-muted hover:text-foreground"
                )}
              >
                {tab === key && (
                  <motion.span
                    layoutId="lab-tab-pill"
                    className="absolute inset-0 rounded-xl bg-accent-learning"
                    transition={{ type: "spring", visualDuration: 0.4, bounce: 0.2 }}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  <Icon size={15} aria-hidden />
                  <span className="whitespace-nowrap">{label}</span>
                </span>
              </button>
            ))}
          </nav>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {tab === "map" && <TopicsMapTab topics={topics} resources={resources} />}
              {tab === "discovery" && <DiscoveryTab topics={topics} resources={resources} />}
              {tab === "library" && <LibraryTab topics={topics} />}
              {tab === "mastery" && <MasteryTab topics={topics} resources={resources} />}
              {tab === "feynman" && <FeynmanTab topics={topics} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>{openId && <TopicCanvasModal key={openId} topicId={openId} onClose={closeCanvas} />}</AnimatePresence>
        <XpPops pops={pops} />
        <ParticleTrailCanvas activeTrailId={activeTrail} />
        {shopOpen && (
          <LifePlusShopModal
            onClose={() => {
              setShopOpen(false);
              // Buying a badge or a theme doesn't change activeTrail, but
              // re-syncing the badge chips on close is cheap and keeps them
              // honest without threading a second callback through every
              // purchase path in the modal.
              void getShopStateAction().then((state) =>
                setOwnedBadgeNames(state.ownedItemIds.map((id) => shopItemById(id)).filter((item) => item?.category === "badge").map((item) => item!.name))
              );
            }}
            onActiveTrailChange={setActiveTrail}
          />
        )}
      </LayoutGroup>
    </LabContext.Provider>
  );
}

// One orb of the mesh: a blurred, softly-edged sphere that drifts slowly and
// breathes (a gentle scale/opacity pulse), independently of the others so the
// mesh never looks like it is repeating on a beat.
interface OrbSpec {
  className: string;
  color: string;
  drift: { x: number[]; y: number[] };
  driftSeconds: number;
  pulseSeconds: number;
  pulseDelay: number;
}

const ORBS: OrbSpec[] = [
  {
    className: "-start-40 top-[-8rem] size-[34rem]",
    color: "var(--accent-learning)",
    drift: { x: [0, 70, 0], y: [0, 40, 0] },
    driftSeconds: 19,
    pulseSeconds: 7,
    pulseDelay: 0,
  },
  {
    className: "-end-32 top-[6rem] size-[30rem]",
    color: "var(--gold)",
    drift: { x: [0, -60, 0], y: [0, -28, 0] },
    driftSeconds: 23,
    pulseSeconds: 8.5,
    pulseDelay: 1.2,
  },
  {
    className: "-start-24 top-[46rem] size-[28rem]",
    color: "var(--accent-career)",
    drift: { x: [0, 50, 0], y: [0, -36, 0] },
    driftSeconds: 26,
    pulseSeconds: 9,
    pulseDelay: 2.4,
  },
  {
    className: "-end-20 top-[78rem] size-[26rem]",
    color: "var(--accent-fitness)",
    drift: { x: [0, -44, 0], y: [0, 32, 0] },
    driftSeconds: 21,
    pulseSeconds: 7.8,
    pulseDelay: 3.6,
  },
];

/**
 * The lab's full-page atmosphere: a handful of blurred, glowing spheres fixed
 * to the viewport, drifting and softly pulsing behind everything.
 *
 * Portalled to <body> rather than rendered in place, and for the exact reason
 * Modal and every other full-screen overlay in this app are (see
 * components/ui/Modal.tsx and TopicCanvasModal): AppWindow opens the page with
 * a scale transform (lib/motion/macLaunch.ts), and a transformed ancestor
 * becomes the containing block for its `position: fixed` descendants — inside
 * it, "fixed to the viewport" quietly becomes "fixed to that box" instead,
 * which is a smaller, scrollable region, not the screen. That is what clipped
 * this to a ~34rem band tied to the search row before: the old version was
 * `absolute` inside the hub's own `position: relative` wrapper, sized to an
 * arbitrary height, with `overflow-hidden` cutting anything past it.
 *
 * `z-index: -10` is deliberate, not decorative: negative z-index paints behind
 * ordinary (auto/positive) content regardless of DOM order, which is what
 * keeps this behind the hub's cards without needing to sit first in the tree —
 * portals always mount last. It still paints in front of the app's own base
 * texture (globals.css `body::before`, z-index -1, rendered as body's
 * first child): body itself creates no stacking context, so both are
 * negative-z-index layers of the same root context, and the later-attached
 * one (this) paints on top of the earlier one (the pseudo-element).
 */
function Ambient({ reduce }: { reduce: boolean }) {
  return (
    <Portal>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        style={{ contain: "strict" }}
      >
        {ORBS.map((orb, i) => (
          <motion.div
            key={i}
            className={cn("absolute rounded-full blur-3xl", orb.className)}
            style={{ background: `radial-gradient(circle, color-mix(in srgb, ${orb.color} 24%, transparent), transparent 70%)` }}
            initial={{ opacity: 0.55, scale: 1 }}
            animate={
              reduce
                ? { opacity: 0.5 }
                : {
                    x: orb.drift.x,
                    y: orb.drift.y,
                    scale: [1, 1.16, 1],
                    opacity: [0.42, 0.62, 0.42],
                  }
            }
            transition={
              reduce
                ? { duration: 0.4 }
                : {
                    x: { duration: orb.driftSeconds, repeat: Infinity, ease: "easeInOut" },
                    y: { duration: orb.driftSeconds, repeat: Infinity, ease: "easeInOut" },
                    scale: { duration: orb.pulseSeconds, repeat: Infinity, ease: "easeInOut", delay: orb.pulseDelay },
                    opacity: { duration: orb.pulseSeconds, repeat: Infinity, ease: "easeInOut", delay: orb.pulseDelay },
                  }
            }
          />
        ))}
      </div>
    </Portal>
  );
}
