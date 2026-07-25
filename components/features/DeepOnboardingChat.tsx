"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, SkipForward } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import type { OnboardingTopic } from "@/lib/onboarding/deepOnboarding";
import type { Person, PersonalDNA } from "@/types";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface OnboardingMessageResponse {
  reply: string;
  complete: boolean;
  fallbackToStaticForm: boolean;
  skippedTopics: OnboardingTopic[];
  personalDNA: PersonalDNA;
  newPeople: Person[];
}

const FRIENDLY_ERROR = "לא הצלחתי להתחבר כרגע. נסה שוב עוד רגע.";
const SKIP_MESSAGE = "אני מעדיף/ה לדלג על השאלה הזו ולהמשיך הלאה.";

// Persisted client-side, not in Supabase — this is the visible transcript
// only. The actual answers (personal_dna/people rows) already save to the
// database turn-by-turn via app/api/onboarding/message; this localStorage
// entry exists purely so closing the panel or reloading the page doesn't
// make the *visible conversation* look like it reset to zero, which is
// what a real user experiences as "onboarding keeps resetting" even
// though the underlying data was actually fine (docs/ATLAS_ARCHITECTURE_
// VISION.md §12 follow-up fix).
const STORAGE_KEY = "atlas:onboarding:transcript";

interface SavedTranscript {
  turns: ChatTurn[];
  skippedTopics: OnboardingTopic[];
}

function loadSavedTranscript(): SavedTranscript | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.turns)) return null;
    return { turns: parsed.turns, skippedTopics: Array.isArray(parsed.skippedTopics) ? parsed.skippedTopics : [] };
  } catch {
    return null;
  }
}

function saveTranscript(turns: ChatTurn[], skippedTopics: OnboardingTopic[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ turns, skippedTopics }));
}

function clearSavedTranscript() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

// Deep Onboarding (docs/ATLAS_ARCHITECTURE_VISION.md §12): a real
// conversation, not a static question list — see app/api/onboarding/message
// for what actually drives it. This component only renders turns and sends
// the next one; every decision about what to ask, what was learned, and
// when the conversation is done lives server-side (lib/onboarding/
// deepOnboarding.ts), the same "route decides, component renders" split
// every other AI-backed surface in this app already follows.
export function DeepOnboardingChat({ onUnavailable }: { onUnavailable: () => void }) {
  const completeOnboarding = useAtlasStore((s) => s.completeOnboarding);
  const applyOnboardingProgress = useAtlasStore((s) => s.applyOnboardingProgress);

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [skippedTopics, setSkippedTopics] = useState<OnboardingTopic[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(history: ChatTurn[], skipped: OnboardingTopic[]) {
    setSending(true);
    try {
      const res = await fetch("/api/onboarding/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, skippedTopics: skipped }),
      });
      if (!res.ok) throw new Error("Onboarding request failed");
      const data: OnboardingMessageResponse = await res.json();

      if (data.fallbackToStaticForm) {
        onUnavailable();
        return;
      }

      const nextTurns: ChatTurn[] = [...history, { role: "assistant", content: data.reply }];
      setTurns(nextTurns);
      setSkippedTopics(data.skippedTopics);
      saveTranscript(nextTurns, data.skippedTopics);
      applyOnboardingProgress({ personalDNA: data.personalDNA, newPeople: data.newPeople });

      if (data.complete) {
        setDone(true);
        clearSavedTranscript();
        await completeOnboarding();
      }
    } catch {
      const nextTurns: ChatTurn[] = [...history, { role: "assistant", content: FRIENDLY_ERROR }];
      setTurns(nextTurns);
      saveTranscript(nextTurns, skipped);
    } finally {
      setSending(false);
    }
  }

  // Resume a saved transcript if one exists (reload, or reopening after the
  // close button) — only starts a brand-new conversation with the AI when
  // there's genuinely nothing to resume. If the saved transcript ends on
  // an unanswered user message (the tab closed mid-request), retry it
  // rather than leaving the user stuck with no reply.
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const saved = loadSavedTranscript();
    if (saved && saved.turns.length > 0) {
      setTurns(saved.turns);
      setSkippedTopics(saved.skippedTopics);
      const last = saved.turns[saved.turns.length - 1];
      if (last.role === "user") send(saved.turns, saved.skippedTopics);
      return;
    }
    send([], []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns]);

  function handleSend() {
    const message = input.trim();
    if (!message || sending || done) return;
    const nextHistory: ChatTurn[] = [...turns, { role: "user", content: message }];
    setTurns(nextHistory);
    saveTranscript(nextHistory, skippedTopics);
    setInput("");
    send(nextHistory, skippedTopics);
  }

  // A direct, discoverable way to skip — reuses the exact same pipeline a
  // typed "I'd rather not answer that" already goes through server-side
  // (the model marks the current topic in topicsSkipped); no new skip
  // logic needed, just a shortcut for the phrasing.
  function handleSkip() {
    if (sending || done) return;
    const nextHistory: ChatTurn[] = [...turns, { role: "user", content: SKIP_MESSAGE }];
    setTurns(nextHistory);
    saveTranscript(nextHistory, skippedTopics);
    send(nextHistory, skippedTopics);
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={scrollRef} className="flex max-h-72 flex-col gap-3 overflow-y-auto">
        {turns.length === 0 && sending && <p className="text-sm leading-relaxed text-muted">אטלס חושב…</p>}
        {turns.map((turn, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={
              turn.role === "assistant"
                ? "text-lg leading-relaxed text-foreground"
                : "self-end rounded-xl bg-accent-knowledge/15 px-3 py-2 text-sm text-foreground"
            }
          >
            {turn.content}
          </motion.p>
        ))}
      </div>

      {!done && (
        <>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            autoFocus
            disabled={sending}
            placeholder="הקלד תשובה..."
            aria-label="תשובה לאטלס"
            className="focus-ring w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted disabled:opacity-60"
          />
          <div className="flex items-center justify-end gap-2">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSkip}
              disabled={sending}
              className="focus-ring flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-muted transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-40"
            >
              <SkipForward size={14} />
              דלג
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="focus-ring flex items-center justify-center gap-1 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-colors hover:bg-accent-faith/30 disabled:opacity-40"
            >
              <Send size={14} />
              {sending ? "שולח…" : "שלח"}
            </motion.button>
          </div>
        </>
      )}
    </div>
  );
}
