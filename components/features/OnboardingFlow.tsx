"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, SkipForward } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { ONBOARDING_QUESTIONS } from "@/lib/constants";
import { Logo } from "@/components/ui/Logo";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { DeepOnboardingChat } from "@/components/features/DeepOnboardingChat";
import { useApiCall } from "@/hooks/useApiCall";
import type { PersonalDNA } from "@/types";

function parseAnswer(fieldId: keyof PersonalDNA, raw: string): Partial<PersonalDNA> {
  if (fieldId === "familyCheckInIntervalDays") {
    const digits = raw.match(/\d+/);
    return { familyCheckInIntervalDays: digits ? Number(digits[0]) : 7 };
  }
  return { [fieldId]: raw } as Partial<PersonalDNA>;
}

// The honest fallback for Deep Onboarding (docs/ATLAS_ARCHITECTURE_VISION.md
// §12): a fixed question list, used only when app/api/onboarding/message
// reports no AI provider is configured. Same questions as before that
// milestone; now also skippable (a question's field is simply left unset
// and the flow moves on), matching the real conversation's own skip
// behavior, so the one path that must always work isn't the one path
// without an escape hatch.
function StaticOnboardingForm() {
  const updatePersonalDNA = useAtlasStore((s) => s.updatePersonalDNA);
  const completeOnboarding = useAtlasStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");

  const question = ONBOARDING_QUESTIONS[step];
  const isLast = step === ONBOARDING_QUESTIONS.length - 1;

  const { loading: saving, error: saveError, run: submitAnswer } = useApiCall(
    async (patch: Partial<PersonalDNA> | null, finish: boolean) => {
      if (patch) await updatePersonalDNA(patch);
      if (finish) await completeOnboarding();
    }
  );

  function advance(patch: Partial<PersonalDNA> | null) {
    submitAnswer(patch, isLast)
      .then(() => {
        setAnswer("");
        if (!isLast) setStep((s) => s + 1);
      })
      .catch(() => {
        // error is already captured in saveError for display below
      });
  }

  function handleNext() {
    if (!answer.trim() || saving) return;
    advance(parseAnswer(question.id, answer.trim()));
  }

  function handleSkip() {
    if (saving) return;
    advance(null);
  }

  return (
    <>
      <p className="text-sm text-muted">
        שאלה {step + 1} מתוך {ONBOARDING_QUESTIONS.length}
      </p>

      <AnimatePresence mode="wait">
        <motion.p
          key={question.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="text-lg leading-relaxed text-foreground"
        >
          {question.prompt}
        </motion.p>
      </AnimatePresence>

      <input
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleNext()}
        autoFocus
        placeholder="הקלד תשובה..."
        aria-label={question.prompt}
        className="focus-ring w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
      />

      {saveError && <p className="text-xs text-accent-family">{saveError}</p>}

      <div className="flex items-center justify-end gap-2">
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSkip}
          disabled={saving}
          className="focus-ring flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-muted transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-40"
        >
          <SkipForward size={14} />
          דלג
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleNext}
          disabled={!answer.trim() || saving}
          className="focus-ring rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-colors hover:bg-accent-faith/30 disabled:opacity-40"
        >
          {saving ? "שומר…" : isLast ? "סיים" : "המשך"}
        </motion.button>
      </div>
    </>
  );
}

export function OnboardingFlow() {
  const onboardingComplete = useAtlasStore((s) => s.onboardingComplete);
  const [useStaticForm, setUseStaticForm] = useState(false);
  // Closing hides the modal for now without marking onboarding complete —
  // reloading the page (or just coming back later) brings it back exactly
  // where the conversation left off, since DeepOnboardingChat's own
  // localStorage-backed transcript and the server's real covered-topics
  // state both survive independently of this flag.
  const [dismissed, setDismissed] = useState(false);

  return (
    <Modal
      open={!onboardingComplete && !dismissed}
      onClose={() => setDismissed(true)}
      closeOnBackdropClick={false}
      closeOnEscape
      zIndex={Z_INDEX.onboarding}
      backdropClassName="items-center bg-black/60 pt-0"
      panelClassName="max-w-md flex flex-col gap-6 p-8"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="text-sm font-medium text-foreground">היכרות ראשונית</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="סגור, אמשיך מאוחר יותר"
          className="focus-ring rounded-lg p-1.5 text-muted transition-all hover:scale-110 hover:bg-white/5 hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      {useStaticForm ? (
        <StaticOnboardingForm />
      ) : (
        <DeepOnboardingChat onUnavailable={() => setUseStaticForm(true)} />
      )}
    </Modal>
  );
}
