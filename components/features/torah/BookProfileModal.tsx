"use client";

import { motion } from "framer-motion";
import { BookOpen, NotebookPen, X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { useAtlasStore } from "@/store/useAtlasStore";
import { extractLinkedBookNames, normalizeName, summaryPreview } from "@/lib/torah/summaryLinks";
import type { Book } from "@/types";

interface BookProfileModalProps {
  book: Book | null;
  onClose: () => void;
}

// Reverse-relation profile: which summaries reference this Book, mirroring
// RabbiProfileModal exactly (see lib/torah/summaryLinks for the shared
// parsing/matching logic). The only real difference is cardinality — a
// summary's "מקורות:" line can name several books, so this checks
// membership (`.some`) instead of RabbiProfileModal's single-name equality.
export function BookProfileModal({ book, onClose }: BookProfileModalProps) {
  const summaries = useAtlasStore((s) => s.summaries);

  const linkedSummaries = book
    ? summaries.filter((s) =>
        extractLinkedBookNames(s.content).some((name) => normalizeName(name) === normalizeName(book.title))
      )
    : [];

  return (
    <Modal
      open={Boolean(book)}
      onClose={onClose}
      closeOnBackdropClick
      closeOnEscape
      zIndex={Z_INDEX.modal}
      panelClassName="flex max-h-[85vh] w-full max-w-2xl flex-col p-0"
    >
      {book && (
        <>
          <div className="flex items-center justify-between gap-2 p-6 pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-faith/15 text-accent-faith">
                <BookOpen size={20} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{book.title}</p>
                {book.author && <p className="truncate text-xs text-muted">{book.author}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="סגור"
              className="focus-ring shrink-0 rounded-lg p-1.5 text-muted transition-all hover:scale-110 hover:bg-white/5 hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrolls independently of the fixed header, same mobile-friendly
              pattern as RabbiProfileModal/AiSummaryModal. */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {book.category && (
              <span className="mb-3 inline-block rounded-full bg-accent-faith/15 px-2 py-0.5 text-xs text-accent-faith">
                {book.category}
              </span>
            )}
            {book.notes && <p className="mb-4 text-sm leading-relaxed text-foreground/70">{book.notes}</p>}

            <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
              <NotebookPen size={12} aria-hidden />
              סיכומים ({linkedSummaries.length})
            </p>

            {linkedSummaries.length === 0 ? (
              <p className="rounded-xl bg-white/5 p-4 text-sm text-muted">אין עדיין סיכומים לספר זה.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {linkedSummaries.map((summary, i) => (
                  <motion.div
                    key={summary.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.3), ease: "easeOut" }}
                    className="rounded-xl bg-white/5 p-4"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{summary.title}</span>
                      <span className="ltr shrink-0 text-xs text-muted">{summary.date}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/70">{summaryPreview(summary.content)}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
