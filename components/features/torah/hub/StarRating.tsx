"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value?: number;
  /** Omit for a read-only display. */
  onChange?: (value: number | undefined) => void;
  size?: number;
  label: string;
}

/**
 * Five stars — interactive as a radio group, or read-only with half-star
 * precision for provider averages.
 *
 * Choosing the current value again clears it: a rating given by mistake must
 * be removable without a separate "clear" control.
 */
export function StarRating({ value, onChange, size = 16, label }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label}: ${value?.toFixed(1) ?? "אין"} מתוך 5`}>
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(1, shown - (star - 1)));
          return (
            <span key={star} className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
              <Star size={size} className="absolute inset-0 text-gold-line" />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} className="fill-gold text-gold" />
              </span>
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <span role="radiogroup" aria-label={label} className="inline-flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} כוכבים`}
          onMouseEnter={() => setHover(star)}
          onClick={() => onChange(value === star ? undefined : star)}
          className="focus-ring rounded p-0.5 transition-transform hover:scale-110"
        >
          <Star size={size} className={cn(star <= shown ? "fill-gold text-gold" : "text-gold-line")} aria-hidden />
        </button>
      ))}
    </span>
  );
}
