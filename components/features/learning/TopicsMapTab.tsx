"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, LayoutGrid, List, Network, type LucideIcon } from "lucide-react";
import { CuriosityRadar } from "@/components/features/learning/CuriosityRadar";
import { TopicGrid, TopicList } from "@/components/features/learning/TopicGrid";
import { VideoStudyPanel } from "@/components/features/learning/VideoStudyPanel";
import { useLab } from "@/components/features/learning/lab/LabContext";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { buildRoll, pickSurpriseTopic } from "@/lib/learning/surprise";
import { filterTopics } from "@/lib/learning/topicSearch";
import { cn } from "@/lib/utils";
import type { LearningResource, LearningTopic } from "@/types";

// The graph view is optional (the grid is the default) and the heaviest thing
// on the tab — its own chunk, loaded when the view is switched to it.
const KnowledgeGraph = dynamic(() => import("@/components/features/learning/KnowledgeGraph").then((m) => m.KnowledgeGraph), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-3xl bg-fill-subtle/40" aria-hidden />,
});

type View = "grid" | "graph" | "list";

const VIEWS: { key: View; label: string; icon: LucideIcon }[] = [
  { key: "grid", label: "רשת", icon: LayoutGrid },
  { key: "graph", label: "מפת ידע", icon: Network },
  { key: "list", label: "רשימה", icon: List },
];

const VIEW_KEY = "lifeplus.learning.view";
/** How long the shuffle's chosen topic stays in the spotlight before it opens. */
const SPOTLIGHT_MS = 1700;

interface TopicsMapTabProps {
  topics: readonly LearningTopic[];
  resources: readonly LearningResource[];
}

/**
 * "מפת ידע ונושאים" — the lab's original surface, unchanged in behaviour: the
 * Curiosity Radar, the grid/graph/list switcher, the surprise shuffle, and the
 * "watch a video without saving it" panel. Pulled out of LearningHub into its
 * own tab so the header/XP bar and the celebration layer (LabContext) stay
 * shared across every tab, while this one owns only what is specific to
 * browsing and discovering topics visually.
 */
export function TopicsMapTab({ topics, resources }: TopicsMapTabProps) {
  const lab = useLab();
  const reduce = useLabReducedMotion();

  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const [litId, setLitId] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [showFreeVideo, setShowFreeVideo] = useState(false);

  const visible = filterTopics(topics, resources, query);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "grid" || saved === "graph" || saved === "list") setView(saved);
    } catch {
      // The default view is fine.
    }
  }, []);

  function changeView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembering the view is harmless.
    }
  }

  const surprise = useCallback(() => {
    if (rolling || visible.length === 0) return;
    const targetId = pickSurpriseTopic(visible, resources);
    if (!targetId) return;

    lab.audio.prime();
    setRolling(true);

    const land = () => {
      setLitId(targetId);
      lab.audio.play("spotlight");
      setRolling(false);
      setTimeout(() => {
        setLitId(null);
        lab.openTopic(targetId);
      }, SPOTLIGHT_MS);
    };

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
      lab.audio.play("tick", i);
      i++;
      if (i >= steps.length) land();
      else setTimeout(tick, step.delayMs);
    };
    tick();
  }, [rolling, visible, resources, lab, reduce]);

  return (
    <div>
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
          {query ? `${visible.length} מתוך ${topics.length} נושאים` : `${topics.length} נושאים`}
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
              {view === "grid" && <TopicGrid topics={visible} resources={resources} litId={litId} onOpen={lab.openTopic} />}
              {view === "list" && <TopicList topics={visible} resources={resources} litId={litId} onOpen={lab.openTopic} />}
              {view === "graph" && <KnowledgeGraph topics={visible} resources={resources} litId={litId} onOpen={lab.openTopic} />}
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
