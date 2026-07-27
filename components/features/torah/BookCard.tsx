"use client";

import { MoreVertical, User } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Book } from "@/types";

interface BookCardProps {
  book: Book;
  delay: number;
  onEdit: (book: Book) => void;
  onOpenProfile: (book: Book) => void;
}

export function BookCard({ book, delay, onEdit, onOpenProfile }: BookCardProps) {
  return (
    <GlassCard delay={delay} className="h-full" onClick={() => onOpenProfile(book)}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{book.title}</p>
          {book.author && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <User size={11} aria-hidden />
              {book.author}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(book);
          }}
          aria-label={`ערוך את ${book.title}`}
          className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <MoreVertical size={16} />
        </button>
      </div>
      {book.category && (
        <span className="mb-2 inline-block rounded-full bg-accent-faith/15 px-2 py-0.5 text-xs text-accent-faith">
          {book.category}
        </span>
      )}
      {book.notes && <p className="text-sm leading-relaxed text-foreground/70">{book.notes}</p>}
    </GlassCard>
  );
}
