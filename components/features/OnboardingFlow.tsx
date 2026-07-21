"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAtlasStore } from "@/store/useAtlasStore";
import { ONBOARDING_QUESTIONS } from "@/lib/constants";
import { Logo } from "@/components/ui/Logo";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { useApiCall } from "@/hooks/useApiCall";
import type { PersonalDNA } from "@/types";

function parseAnswer(fieldId: keyof PersonalDNA, raw: string): Partial<PersonalDNA> {
  if (fieldId === "familyCheckInIntervalDays") {
    const digits = raw.match(/\d+/);
    return { familyCheckInIntervalDays: digits ? Number(digits[0]) : 7 };
  }
  return { [fieldId]: raw } as Partial<PersonalDNA>;
}

export function OnboardingFlow() {
  const onboardingComplete = useAtlasStore((s) => s.onboardingComplete);
  const updatePersonalDNA = useAtlasStore((s) => s.updatePersonalDNA);
  const completeOnboarding = useAtlasStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");

  const question = ONBOARDING_QUESTIONS[step];
  const isLast = step === ONBOARDING_QUESTIONS.length - 1;

  const { loading: saving, error: saveError, run: submitAnswer } = useApiCall(
    async (patch: Partial<PersonalDNA>, finish: boolean) => {
      await updatePersonalDNA(patch);
      if (finish) await completeOnboarding();
    }
  );

  function handleNext() {
    if (!answer.trim() || saving) return;
    submitAnswer(parseAnswer(question.id, answer.trim()), isLast)
      .then(() => {
        setAnswer("");
        if (!isLast) setStep((s) => s + 1);
      })
      .catch(() => {
        // error is already captured in saveError for display below
      });
  }

  return (
    <Modal
      open={!onboardingComplete}
      closeOnBackdropClick={false}
      closeOnEscape={false}
      zIndex={Z_INDEX.onboarding}
      backdropClassName="items-center bg-black/60 pt-0"
      panelClassName="max-w-md flex flex-col gap-6 p-8"
    >
      <div className="flex items-center gap-2">
        <Logo size={22} />
        <span className="text-sm text-muted">
          שאלה {step + 1} מתוך {ONBOARDING_QUESTIONS.length}
        </span>
      </div>

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

      <button
        onClick={handleNext}
        disabled={!answer.trim() || saving}
        className="self-end rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-opacity disabled:opacity-40"
      >
        {saving ? "שומר…" : isLast ? "סיים" : "המשך"}
      </button>
    </Modal>
  );
}
