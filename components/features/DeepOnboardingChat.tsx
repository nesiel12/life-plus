"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { Logo } from "@/components/ui/Logo";
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

      setTurns((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setSkippedTopics(data.skippedTopics);
      applyOnboardingProgress({ personalDNA: data.personalDNA, newPeople: data.newPeople });

      if (data.complete) {
        setDone(true);
        await completeOnboarding();
      }
    } catch {
      setTurns((prev) => [...prev, { role: "assistant", content: FRIENDLY_ERROR }]);
    } finally {
      setSending(false);
    }
  }

  // Kicks off the conversation once, with the opening question — the AI
  // decides what to open with (it sees an empty transcript and is told
  // nothing is covered yet), not a hardcoded greeting line.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
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
    setInput("");
    send(nextHistory, skippedTopics);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Logo size={22} />
        <span className="text-sm text-muted">היכרות ראשונית</span>
      </div>

      <div ref={scrollRef} className="flex max-h-72 flex-col gap-3 overflow-y-auto">
        {turns.length === 0 && sending && <p className="text-sm leading-relaxed text-muted">אטלס חושב…</p>}
        {turns.map((turn, i) => (
          <p
            key={i}
            className={
              turn.role === "assistant"
                ? "text-lg leading-relaxed text-foreground"
                : "self-end rounded-xl bg-accent-knowledge/15 px-3 py-2 text-sm text-foreground"
            }
          >
            {turn.content}
          </p>
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
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="focus-ring flex items-center justify-center gap-1 self-end rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-opacity disabled:opacity-40"
          >
            <Send size={14} />
            {sending ? "שולח…" : "שלח"}
          </button>
        </>
      )}
    </div>
  );
}
