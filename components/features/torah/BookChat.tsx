"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Loader2, MessageCircleQuestion, RotateCcw, Send, Sparkles } from "lucide-react";
import { PageSection } from "@/components/features/torah/hub/PageSection";
import { CitationCard, type Citation } from "@/components/features/torah/hub/CitationCard";

interface Turn {
  question: string;
  answer: string;
  confident: boolean;
  citations: Citation[];
}

interface BookChatProps {
  bookId: string;
  bookTitle: string;
  delay?: number;
}

const STARTERS = ["על מה הספר הזה?", "איך כדאי ללמוד אותו?", "מה המבנה של הספר?", "מה החידוש המרכזי שלו?"];

// History sent back for follow-ups. Matches the route's bound.
const HISTORY_TURNS = 3;

function storageKey(bookId: string) {
  return `torah-book-chat:${bookId}`;
}

function loadThread(bookId: string): Turn[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey(bookId)) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The book-scoped AI assistant — a conversation with a chavruta who knows
 * this sefer.
 *
 * Every citation says whether it was VERIFIED: resolved by Sefaria's own
 * reference parser and backed by the Hebrew text it returned, which is shown
 * under it. An unverified citation is still shown, visibly as the model's own
 * words. A reference the user can open and one they cannot check must never
 * look the same.
 *
 * The thread lives in sessionStorage per book: it survives navigating to the
 * author's page and back, and does not outlive the sitting.
 */
export function BookChat({ bookId, bookTitle, delay }: BookChatProps) {
  const reduceMotion = useReducedMotion();
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLLIElement>(null);

  // Which book the in-memory thread belongs to. Saving is gated on it, so
  // moving from one book's page to another's never writes the previous
  // book's conversation under the new book's key before the load lands.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    setThread(loadThread(bookId));
    setLoadedFor(bookId);
  }, [bookId]);

  useEffect(() => {
    if (loadedFor !== bookId) return;
    try {
      window.sessionStorage.setItem(storageKey(bookId), JSON.stringify(thread.slice(-12)));
    } catch {
      // Storage blocked: the thread simply does not persist.
    }
  }, [bookId, loadedFor, thread]);

  useEffect(() => {
    if (thread.length > 0 || pending) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [thread.length, pending]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setPending(trimmed);
    setQuestion("");
    setError(null);
    try {
      const response = await fetch(`/api/torah/books/${bookId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          history: thread.slice(-HISTORY_TURNS).map((t) => ({ question: t.question, answer: t.answer.slice(0, 3000) })),
        }),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        setError(typeof data.error === "string" ? data.error : "השאלה נכשלה. נסה שוב.");
        setQuestion(trimmed);
        return;
      }

      setThread((prev) => [
        ...prev,
        {
          question: trimmed,
          answer: data.answer,
          confident: Boolean(data.confident),
          citations: Array.isArray(data.citations) ? data.citations : [],
        },
      ]);
    } catch {
      setError("השאלה נכשלה. נסה שוב.");
      setQuestion(trimmed);
    } finally {
      setPending(null);
    }
  }

  return (
    <PageSection
      id="assistant"
      icon={MessageCircleQuestion}
      tone="faith"
      title="החברותא החכמה של הספר"
      subtitle="שאלות על הספר, עם מראי מקומות שנבדקים מול ספריא"
      delay={delay}
      action={
        thread.length > 0 ? (
          <button
            type="button"
            onClick={() => setThread([])}
            className="focus-ring flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
          >
            <RotateCcw size={12} aria-hidden />
            שיחה חדשה
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {thread.length === 0 && !pending && (
          <div className="flex flex-col gap-3 rounded-xl bg-gold-soft/50 p-4">
            <p className="flex items-center gap-2 text-sm text-foreground/85">
              <Sparkles size={14} className="text-gold-ink" aria-hidden />
              שאל כל שאלה על {bookTitle} — התשובה תגיע עם מקורות מהספר עצמו.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void ask(starter)}
                  className="focus-ring rounded-full border border-gold-line bg-surface px-3 py-1 text-xs text-foreground/80 transition-colors hover:text-foreground"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {thread.length > 0 && (
          <ol className="flex max-h-[34rem] flex-col gap-5 overflow-y-auto pe-1" aria-live="polite">
            {thread.map((turn, index) => (
              <motion.li
                key={`${index}-${turn.question}`}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2.5"
              >
                <p className="ms-auto max-w-[85%] rounded-2xl rounded-se-sm bg-foreground px-3.5 py-2 text-sm text-background">
                  {turn.question}
                </p>
                <div className="max-w-[92%] rounded-2xl rounded-ss-sm border border-hairline-card bg-surface px-4 py-3">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{turn.answer}</p>
                  {!turn.confident && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
                      <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden />
                      זה רקע כללי, לא ציטוט מהספר עצמו.
                    </p>
                  )}
                  {turn.citations.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2 border-t border-hairline-card pt-3">
                      {turn.citations.map((citation, i) => (
                        <CitationCard key={`${citation.reference}-${i}`} citation={citation} />
                      ))}
                    </ul>
                  )}
                </div>
              </motion.li>
            ))}
            <li ref={endRef} aria-hidden />
          </ol>
        )}

        {pending && (
          <div className="flex flex-col gap-2.5" role="status">
            <p className="ms-auto max-w-[85%] rounded-2xl rounded-se-sm bg-foreground px-3.5 py-2 text-sm text-background">
              {pending}
            </p>
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" aria-hidden />
              מעיין בספר ובודק מקורות מול ספריא…
            </p>
          </div>
        )}

        {error && <p className="text-xs text-accent-family">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="flex items-center gap-2 rounded-2xl border border-hairline-card bg-surface p-1.5 ps-3.5 focus-within:border-gold-line"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={thread.length ? "שאלת המשך…" : "למשל: מה הספר אומר על הדלקת נרות חנוכה?"}
            aria-label={`שאלה על ${bookTitle}`}
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={!question.trim() || Boolean(pending)}
            aria-label="שלח שאלה"
            className="focus-ring grid size-9 shrink-0 place-items-center rounded-xl bg-gold text-white transition-opacity disabled:opacity-40"
          >
            {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} className="-scale-x-100" aria-hidden />}
          </button>
        </form>
      </div>
    </PageSection>
  );
}
