"use client";

import Image from "next/image";
import { BookOpen, MoreVertical, User } from "lucide-react";
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
        <div className="flex min-w-0 gap-2.5">
          {/* A spine-sized cover, not a hero image — the card's job is still
              to be scannable in a grid of twenty. Falls back to the icon
              tile, so a hand-typed book and a fetched one sit at the same
              height and the grid does not go ragged. */}
          {book.coverImageUrl ? (
            <Image
              src={book.coverImageUrl}
              alt=""
              width={32}
              height={44}
              className="h-11 w-8 shrink-0 rounded object-cover ring-1 ring-hairline-card"
              aria-hidden
              unoptimized
            />
          ) : (
            <span className="grid h-11 w-8 shrink-0 place-items-center rounded bg-accent-faith/12 text-accent-faith">
              <BookOpen size={13} aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{book.hebrewTitle ?? book.title}</p>
            {book.author && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <User size={11} aria-hidden />
                <span className="truncate">{book.author}</span>
              </p>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(book);
          }}
          aria-label={`ערוך את ${book.title}`}
          className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
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
