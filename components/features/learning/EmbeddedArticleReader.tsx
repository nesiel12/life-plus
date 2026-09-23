"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Sparkles, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

interface EmbeddedArticleReaderProps {
  url: string;
  title: string;
  onClose: () => void;
}

interface ExtractResponse {
  title: string | null;
  paragraphs: string[];
  keyParagraphIndices: number[];
  keyParagraphNotes: Record<number, string>;
}

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: ExtractResponse };

const READER_Z_INDEX = "z-[135]";
const EXTRACTION_FAILED = "לא הצלחנו לחלץ את התוכן מהכתבה הזו";

/**
 * Reads an external article in-app instead of opening a new tab — the
 * default for a PioneerExternalLink of type "article" (PioneerProfileDrawer.
 * tsx). Server-side fetch + Readability extraction (app/api/learning/
 * article/extract/route.ts), not an <iframe>: most third-party sites block
 * framing outright (the same reason ResourceLauncher.tsx already falls back
 * to a new tab for non-YouTube links), and an iframe couldn't feed the
 * article's own text to the AI for highlighting/explaining anyway.
 *
 * A universal in-app reader for arbitrary third-party URLs genuinely isn't
 * achievable — bot walls, paywalls, non-HTML responses. The error state's
 * "open in a new tab" link is the one deliberate, labeled exception to
 * "zero external tabs," not a fallback nobody meant to need.
 */
export function EmbeddedArticleReader({ url, title, onClose }: EmbeddedArticleReaderProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [explaining, setExplaining] = useState<Record<number, string | "loading" | "error">>({});

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch("/api/learning/article/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error" });
          return;
        }
        const data = (await res.json()) as ExtractResponse;
        setState({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function explainParagraph(index: number, paragraph: string) {
    setExplaining((current) => ({ ...current, [index]: "loading" }));
    try {
      const res = await fetch("/api/learning/article/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, paragraph }),
      });
      if (!res.ok) throw new Error("failed");
      const { explanation } = (await res.json()) as { explanation: string };
      setExplaining((current) => ({ ...current, [index]: explanation }));
    } catch {
      setExplaining((current) => ({ ...current, [index]: "error" }));
    }
  }

  return (
    <Modal open onClose={onClose} align="center" zIndex={READER_Z_INDEX} label={`קריאת כתבה: ${title}`} panelClassName="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden p-4 sm:p-6">
      <div dir="rtl" className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-semibold text-foreground">{(state.kind === "ready" && state.data.title) || title}</h2>
        <button onClick={onClose} aria-label="סגור" className="focus-ring grid size-9 shrink-0 place-items-center rounded-full bg-fill-subtle text-muted transition-colors hover:text-foreground">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div dir="rtl" className="min-h-0 flex-1 overflow-y-auto">
        {state.kind === "loading" && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline-card p-10 text-center">
            <Loader2 size={22} className="animate-spin text-accent-learning" aria-hidden />
            <p className="text-sm text-muted">טוען את הכתבה…</p>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline-card p-10 text-center">
            <AlertTriangle size={22} className="text-accent-family" aria-hidden />
            <p className="text-sm text-foreground">{EXTRACTION_FAILED}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring flex items-center gap-1.5 rounded-xl bg-accent-learning/15 px-4 py-2 text-sm font-medium text-accent-learning transition-opacity hover:opacity-80"
            >
              פתח בכרטיסייה חדשה
              <ExternalLink size={13} aria-hidden />
            </a>
          </div>
        )}

        {state.kind === "ready" && (
          <div className="masterclass-prose flex flex-col gap-1">
            {state.data.paragraphs.map((paragraph, i) => {
              const isKey = state.data.keyParagraphIndices.includes(i);
              const explainState = explaining[i];
              return (
                <div key={i} className={cn("group rounded-xl p-2 -m-2", isKey && "bg-gold/10")}>
                  {/* dir="auto", not inherited rtl: the extracted article's
                      own language is whatever the source page was written
                      in (this reader has no language filter) — an English
                      source forced into the surrounding RTL flow reverses
                      its own punctuation (a period lands before the last
                      word, not after). The reader chrome around it (notes,
                      buttons) stays RTL since that's always Hebrew UI text. */}
                  <p className="m-0" dir="auto">
                    {paragraph}
                  </p>
                  {isKey && state.data.keyParagraphNotes[i] && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-gold-ink">
                      <Sparkles size={12} className="mt-0.5 shrink-0" aria-hidden />
                      {state.data.keyParagraphNotes[i]}
                    </p>
                  )}
                  {!explainState && (
                    <button
                      onClick={() => void explainParagraph(i, paragraph)}
                      className="focus-ring mt-1 text-xs font-medium text-accent-learning opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      הסבר לי
                    </button>
                  )}
                  {explainState === "loading" && <p className="mt-1 text-xs text-muted">מסביר…</p>}
                  {explainState === "error" && <p className="mt-1 text-xs text-accent-family">לא הצלחנו להסביר את הקטע הזה</p>}
                  {explainState && explainState !== "loading" && explainState !== "error" && (
                    <p className="mt-1 rounded-lg bg-fill-subtle px-2.5 py-1.5 text-xs leading-relaxed text-foreground/90">{explainState}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
