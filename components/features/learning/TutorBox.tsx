"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GraduationCap, Loader2, SendHorizontal } from "lucide-react";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { readAiError } from "@/lib/api/aiClient";
import { cn } from "@/lib/utils";

interface TutorBoxProps {
  topicTitle: string;
  /** Titles of the topic's resources, to ground the question in what is being studied. */
  resourceTitles: readonly string[];
  /** The step open on the canvas, if any — questions are about it first. */
  stepTitle?: string;
  /**
   * Roleplay: real people tied to the step (the step brief's key figures).
   * Picking one makes the tutor answer in character — a simulation, and it
   * says so.
   */
  personas?: readonly TutorPersona[];
  /** Hides the box's own heading when a surrounding drawer already has one. */
  hideHeading?: boolean;
}

export interface TutorPersona {
  name: string;
  contribution: string;
}

const PROMPTS = ["הסבר לי את הנושא בקצרה", "תן לי דוגמה", "בחן אותי בשלוש שאלות"];
const MAX_RESOURCES_IN_PROMPT = 5;
const PARTICLES = [0, 60, 120, 180, 240, 300];

/** The question, framed so the answer is a tutor's and is about *this* topic. */
export function buildTutorMessage(
  topicTitle: string,
  resourceTitles: readonly string[],
  question: string,
  options: { stepTitle?: string; persona?: TutorPersona } = {}
): string {
  const sources = resourceTitles.slice(0, MAX_RESOURCES_IN_PROMPT).join("; ");
  const { stepTitle, persona } = options;
  return [
    `אני לומד את הנושא "${topicTitle}"${sources ? ` (המקורות שלי: ${sources})` : ""}.`,
    stepTitle ? `כרגע אני בשלב: "${stepTitle}".` : "",
    `השאלה שלי: ${question.trim()}`,
    persona
      ? `ענה בגוף ראשון בדמותו של ${persona.name} (${persona.contribution}) — סימולציה חינוכית: שמור על עובדות היסטוריות נכונות, אל תמציא ציטוטים, ואם נשאלת על משהו שקרה אחרי תקופתו — אמור זאת בדמות. בקצרה ובעברית.`
      : "ענה כמורה פרטי — בקצרה, בבהירות ובעברית.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * "שאל על הנושא": ask the AI about what you are studying.
 *
 * Uses the same chat endpoint as the Companion (which already grounds study
 * questions in the person's own topics), and saves nothing — it is a scratch
 * question, not a conversation to file away. While an answer is on its way a
 * ring pulses around the box and six sparks orbit it: transforms and opacity
 * only, and still under reduced motion.
 */
export function TutorBox({ topicTitle, resourceTitles, stepTitle, personas = [], hideHeading }: TutorBoxProps) {
  const reduce = useLabReducedMotion();
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [phase, setPhase] = useState<"idle" | "thinking" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState<string | null>(null);
  const persona = personas.find((p) => p.name === personaName);
  const controllerRef = useRef<AbortController | null>(null);

  // Closing the canvas mid-answer must not leave a request running.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const busy = phase === "thinking" || phase === "streaming";

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("thinking");
    setReply("");
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: buildTutorMessage(topicTitle, resourceTitles, q, { stepTitle, persona }), history: [] }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error((await readAiError(res, "Tutor request failed")).message);
      if (!res.body) throw new Error("Tutor request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text2 = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text2 += decoder.decode(value, { stream: true });
        setPhase("streaming");
        setReply(text2);
      }
      setPhase("idle");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error && err.message !== "Tutor request failed" ? err.message : "לא הצלחתי לענות כרגע. נסה שוב עוד רגע.");
      setPhase("error");
    }
  }

  return (
    <section aria-label="שאל על הנושא" className="flex flex-col gap-3">
      {!hideHeading && (
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <GraduationCap size={17} className="text-accent-learning" aria-hidden />
          שאל על הנושא
        </h3>
      )}

      {personas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">מי עונה?</span>
          <div role="radiogroup" aria-label="מי עונה" className="flex flex-wrap gap-1.5">
            {[null, ...personas.map((p) => p.name)].map((name) => (
              <button
                key={name ?? "tutor"}
                type="button"
                role="radio"
                aria-checked={personaName === name}
                onClick={() => {
                  setPersonaName(name);
                  setReply("");
                  setError(null);
                }}
                className={cn(
                  "focus-ring min-h-11 rounded-full px-3 text-xs font-medium transition-colors",
                  personaName === name ? "bg-accent-learning text-background" : "bg-fill-subtle text-foreground hover:bg-accent-learning/15"
                )}
              >
                {name ? `🎭 ${name}` : "המורה"}
              </button>
            ))}
          </div>
          {persona && <p className="text-[11px] text-muted">סימולציה: הבינה המלאכותית משחקת את {persona.name}. זה לא ציטוט אמיתי.</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => void ask(prompt)}
            disabled={busy}
            className="focus-ring min-h-11 rounded-full border border-hairline-card px-3 py-1 text-xs text-muted transition-colors hover:border-transparent hover:bg-fill-subtle hover:text-foreground disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="relative">
        {/* The pulse and the sparks: alive while an answer is being made. */}
        <AnimatePresence>
          {busy && (
            <motion.div key="aura" aria-hidden className="pointer-events-none absolute -inset-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.span
                className="absolute inset-0 rounded-2xl bg-accent-learning/30 blur-md"
                animate={{ opacity: [0.35, 0.9, 0.35], scale: [1, 1.03, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
              {!reduce && (
                <motion.span className="absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }}>
                  {PARTICLES.map((angle) => (
                    <motion.span
                      key={angle}
                      className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-accent-learning"
                      style={{ transform: `rotate(${angle}deg) translateY(-2.6rem)` }}
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: angle / 360, ease: "easeInOut" }}
                    />
                  ))}
                </motion.span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="relative flex items-center gap-2 rounded-2xl border border-hairline-card bg-surface p-1.5"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={persona ? `שאל/י את ${persona.name}…` : "מה לא ברור? שאל כל דבר על הנושא…"}
            aria-label="שאלה על הנושא"
            maxLength={1000}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
          />
          <MagneticButton
            type="submit"
            disabled={!question.trim() || busy}
            aria-label="שלח שאלה"
            className="grid size-11 place-items-center rounded-xl bg-accent-learning text-background transition-opacity disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <SendHorizontal size={16} className="-scale-x-100" aria-hidden />}
          </MagneticButton>
        </form>
      </div>

      <AnimatePresence>
        {(reply || phase === "thinking" || error) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            aria-live="polite"
            className={cn(
              "rounded-2xl px-4 py-3 text-sm leading-relaxed",
              error ? "bg-accent-family/10 text-accent-family" : "bg-fill-subtle text-foreground"
            )}
          >
            {error ?? (reply || <span className="text-muted">חושב…</span>)}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
