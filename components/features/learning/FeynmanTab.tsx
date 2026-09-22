"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, FileDown, Lightbulb, Loader2, Send } from "lucide-react";
import { useLab } from "@/components/features/learning/lab/LabContext";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { gradeFeynmanExplanation } from "@/lib/learning/labClient";
import { CLARITY_BAND_LABELS, clarityBand } from "@/lib/learning/feynman";
import type { FeynmanEvaluation } from "@/lib/ai/agents/learningLabAgent";
import type { LearningTopic } from "@/types";
import { cn } from "@/lib/utils";

interface FeynmanTabProps {
  topics: readonly LearningTopic[];
}

const BAND_TONE = {
  unclear: "text-accent-family",
  partial: "text-accent-fitness",
  clear: "text-accent-learning",
  excellent: "text-accent-health",
} as const;

/**
 * מעבדת פיינמן — "הסבר במילים פשוטות". The user picks a topic, names the
 * concept they want to check themselves on, and writes the explanation in
 * their own words; the model marks how clear it actually was and what it is
 * missing (lib/learning/feynman.ts / app/api/ai/learning-lab mode
 * "feynmanGrade"). Nothing here is saved — same as the topic canvas's own
 * TutorBox — this is a scratch exercise, not a record.
 *
 * The study-sheet generator sits at the bottom of the same tab: a printed
 * page is the natural next step once you have actually checked your own
 * understanding of a topic.
 */
export function FeynmanTab({ topics }: FeynmanTabProps) {
  const lab = useLab();
  const reduce = useLabReducedMotion();
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [concept, setConcept] = useState("");
  const [explanation, setExplanation] = useState("");
  const [evaluation, setEvaluation] = useState<FeynmanEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topic = topics.find((t) => t.id === topicId) ?? null;

  async function evaluate() {
    if (!topic || !concept.trim() || !explanation.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await gradeFeynmanExplanation(topic.title, concept.trim(), explanation.trim());
      setEvaluation(result);
      lab.audio.play(result.clarityScore >= 65 ? "chime" : "shaky");
      if (result.clarityScore >= 85) lab.celebrate("milestone", 0);
    } catch {
      setError("לא הצלחנו להעריך את ההסבר כרגע. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  if (topics.length === 0) {
    return <p className="rounded-2xl border border-dashed border-hairline-card p-8 text-center text-sm text-muted">הוסף נושא לימוד קודם כדי להשתמש בשיטת פיינמן.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="הסבר במילים פשוטות" className="flex flex-col gap-4 rounded-3xl border border-hairline-card bg-surface p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Lightbulb size={17} className="text-accent-learning" aria-hidden />
          הסבר במילים פשוטות
        </h2>
        <p className="text-xs leading-relaxed text-muted">שיטת פיינמן: תסביר מושג כאילו אתה מלמד מישהו שלא מכיר אותו בכלל. אם קשה לך להסביר בפשטות — כנראה שיש שם פער בהבנה.</p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)} aria-label="נושא" className="focus-ring rounded-xl bg-fill-subtle px-3 py-2 text-sm text-foreground">
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="איזה מושג? למשל: עקרון אי-הוודאות"
            aria-label="המושג להסביר"
            className="focus-ring rounded-xl bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
        </div>

        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="ההסבר שלך, במילים שלך…"
          rows={5}
          className="focus-ring resize-none rounded-xl bg-fill-subtle p-3 text-sm text-foreground placeholder:text-muted"
        />

        <MagneticButton
          onClick={() => void evaluate()}
          disabled={!concept.trim() || !explanation.trim() || loading}
          className="flex w-fit items-center gap-1.5 rounded-xl bg-accent-learning px-4 py-2 text-sm font-semibold text-background transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} className="-scale-x-100" aria-hidden />}
          בדוק את ההסבר שלי
        </MagneticButton>

        {error && <p className="text-xs text-accent-family">{error}</p>}

        {evaluation && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 rounded-2xl bg-fill-subtle p-4">
            <div className="flex items-center gap-3">
              <span className={cn("text-2xl font-bold tabular-nums", BAND_TONE[clarityBand(evaluation.clarityScore)])}>{evaluation.clarityScore}</span>
              <span className="text-sm font-medium text-foreground">{CLARITY_BAND_LABELS[clarityBand(evaluation.clarityScore)]}</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">{evaluation.feedback}</p>
            {evaluation.gaps.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <AlertCircle size={12} aria-hidden />
                  פערים שכדאי להשלים
                </p>
                <ul className="flex flex-col gap-1">
                  {evaluation.gaps.map((g, i) => (
                    <li key={i} className="text-xs leading-relaxed text-foreground/80">
                      • {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </section>

      {topic && <StudySheetLauncher topic={topic} />}
    </div>
  );
}

function StudySheetLauncher({ topic }: { topic: LearningTopic }) {
  return (
    <section aria-label="דף סיכום להדפסה" className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-hairline-card bg-surface p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <FileDown size={16} className="text-accent-learning" aria-hidden />
          דף סיכום להדפסה
        </h2>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
          דף סיכום נקי ל&quot;{topic.title}&quot; — שלבי הסילבוס, ציטוטים שמורים וציון השליטה, עם קוד QR שחוזר ישירות לנושא הדיגיטלי.
        </p>
      </div>
      <a
        href={`/areas/learning/topics/${topic.id}/study-sheet`}
        target="_blank"
        rel="noreferrer"
        className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-learning px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
      >
        <FileDown size={14} aria-hidden />
        פתח דף סיכום
      </a>
    </section>
  );
}
