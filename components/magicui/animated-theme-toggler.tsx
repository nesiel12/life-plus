"use client";

// Adapted from MagicUI's AnimatedThemeToggler (magicui.design) — Option B.
// LIFE PLUS uses a [data-theme] attribute on <html> (not a `.dark` class) and
// its own ThemeProvider for persistence, so this is the *controlled* variant:
// the parent owns state via `theme` / `onThemeChange`. The View-Transitions
// circle-reveal wipe is kept — it's the premium touch.

import { useCallback, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<"button"> {
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  duration?: number;
}

export function AnimatedThemeToggler({
  theme,
  onThemeChange,
  duration = 450,
  className,
  ...props
}: AnimatedThemeTogglerProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDark = theme === "dark";

  const toggle = useCallback(() => {
    const next: "light" | "dark" = isDark ? "light" : "dark";
    const apply = () => flushSync(() => onThemeChange(next));

    const btn = buttonRef.current;
    if (typeof document.startViewTransition !== "function" || !btn) {
      onThemeChange(next);
      return;
    }

    const { top, left, width, height } = btn.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${maxRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration,
            easing: "ease-in-out",
            fill: "forwards",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {});
  }, [isDark, onThemeChange, duration]);

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={toggle}
      aria-label={isDark ? "עבור למצב בהיר" : "עבור למצב כהה"}
      className={cn(
        "focus-ring flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-fill-subtle hover:text-foreground",
        className
      )}
      {...props}
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
