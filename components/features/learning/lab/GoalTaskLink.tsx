"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ListTodo, Loader2, Target } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { cn } from "@/lib/utils";
import type { LifeAreaKey } from "@/types";

interface GoalTaskLinkProps {
  topicTitle: string;
  /** The next unfinished syllabus step, if any — the sensible default title for a spawned task. */
  nextStepTitle?: string;
}

const LEARNING_GOAL_CATEGORY: LifeAreaKey = "knowledge";

/**
 * Goal & Task Synergy: turns a learning topic (or its next syllabus step)
 * into a real Task Engine task, or attaches it as a milestone on an existing
 * active Goal — through the exact store actions every other "add a task" /
 * "add a milestone" surface in the app already uses (useAtlasStore's addTask,
 * addMilestone), so it shows up in the Smart Calendar / Goals board like
 * anything else, not a parallel tracker only the Learning lab can see.
 */
export function GoalTaskLink({ topicTitle, nextStepTitle }: GoalTaskLinkProps) {
  const addTask = useAtlasStore((s) => s.addTask);
  const addGoal = useAtlasStore((s) => s.addGoal);
  const addMilestone = useAtlasStore((s) => s.addMilestone);
  const goals = useAtlasStore((s) => s.goals);
  const reduce = useLabReducedMotion();

  const [open, setOpen] = useState<"task" | "goal" | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"task" | "goal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeGoals = goals.filter((g) => g.milestones.some((m) => !m.done) || g.milestones.length === 0);
  const taskTitle = nextStepTitle ? `${topicTitle}: ${nextStepTitle}` : `להתקדם בנושא "${topicTitle}"`;

  async function spawnTask() {
    setBusy(true);
    setError(null);
    try {
      await addTask({ title: taskTitle });
      setDone("task");
      setOpen(null);
      setTimeout(() => setDone(null), 2500);
    } catch {
      setError("לא הצלחנו להוסיף משימה. נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function linkGoal() {
    setBusy(true);
    setError(null);
    try {
      if (selectedGoalId) {
        await addMilestone(selectedGoalId, taskTitle);
      } else {
        // No active goal to attach to — offer a fresh one built around this topic.
        await addGoal(`ללמוד: ${topicTitle}`, LEARNING_GOAL_CATEGORY, [taskTitle]);
      }
      setDone("goal");
      setOpen(null);
      setTimeout(() => setDone(null), 2500);
    } catch {
      setError("לא הצלחנו לקשר ליעד. נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <MagneticButton
        onClick={() => setOpen(open === "task" ? null : "task")}
        className={cn("flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors", open === "task" ? "border-accent-time bg-accent-time/10 text-accent-time" : "border-hairline-card text-foreground hover:bg-fill-subtle")}
      >
        {done === "task" ? <Check size={12} className="text-accent-health" aria-hidden /> : <ListTodo size={12} aria-hidden />}
        הפוך למשימה
      </MagneticButton>
      <MagneticButton
        onClick={() => setOpen(open === "goal" ? null : "goal")}
        className={cn("flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors", open === "goal" ? "border-accent-career bg-accent-career/10 text-accent-career" : "border-hairline-card text-foreground hover:bg-fill-subtle")}
      >
        {done === "goal" ? <Check size={12} className="text-accent-health" aria-hidden /> : <Target size={12} aria-hidden />}
        קשר ליעד
      </MagneticButton>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -6, scale: 0.97 }}
            transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.25, duration: 0.35 }}
            className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border border-hairline-card bg-surface p-3 shadow-xl"
          >
            {open === "task" ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">משימה חדשה במנוע המשימות:</p>
                <p className="rounded-lg bg-fill-subtle px-2.5 py-1.5 text-sm text-foreground">{taskTitle}</p>
                <MagneticButton
                  onClick={() => void spawnTask()}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-accent-time/15 px-3 py-1.5 text-xs font-medium text-accent-time transition-opacity disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <ListTodo size={12} aria-hidden />}
                  הוסף משימה
                </MagneticButton>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">{activeGoals.length > 0 ? "קשר כאבן דרך ליעד קיים:" : "אין יעד פעיל — ניצור אחד חדש סביב הנושא:"}</p>
                {activeGoals.length > 0 && (
                  <select value={selectedGoalId} onChange={(e) => setSelectedGoalId(e.target.value)} aria-label="בחר יעד" className="focus-ring rounded-lg bg-fill-subtle px-2.5 py-1.5 text-sm text-foreground">
                    <option value="">צור יעד חדש</option>
                    {activeGoals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                )}
                <MagneticButton
                  onClick={() => void linkGoal()}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-accent-career/15 px-3 py-1.5 text-xs font-medium text-accent-career transition-opacity disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Target size={12} aria-hidden />}
                  {selectedGoalId ? "אשר קישור" : "צור יעד וקשר"}
                </MagneticButton>
              </div>
            )}
            {error && <p className="mt-2 text-xs text-accent-family">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
