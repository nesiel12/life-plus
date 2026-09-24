"use client";

import { useEffect, useRef, type RefObject } from "react";

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The visible, focusable elements inside `root`, in DOM order. */
export function focusableIn(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((n) => n.offsetParent !== null || n === document.activeElement);
}

/**
 * Whether a key event belongs to the modal layer `root`: the focused element's
 * nearest aria-modal ancestor is `root` itself (or nothing has focus). A layer
 * stacked on top — a drawer inside the canvas, a pioneer profile over the
 * classroom — owns its own keys, so the layers beneath stay out of the way.
 */
export function isOwnLayerEvent(root: HTMLElement | null, e: KeyboardEvent): boolean {
  if (!root) return false;
  const target = e.target instanceof Element ? e.target : null;
  if (!target || target === document.body) return true;
  return target.closest('[aria-modal="true"]') === root;
}

/**
 * Keeps Tab inside `ref` while `active`, closes on Escape, moves focus in on
 * open and hands it back to the opener on close. `ref` must be the element
 * carrying aria-modal="true" (see isOwnLayerEvent). Handled events stop
 * propagating, so nothing beneath reacts to the same key.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  // Latest callback in a ref: the effect below must run once per open, not on
  // every render a parent passes a fresh closure — re-running it would yank
  // focus back to the first control each time.
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => (initialFocus?.current ?? focusableIn(ref.current)[0])?.focus());

    function onKeyDown(e: KeyboardEvent) {
      if (!isOwnLayerEvent(ref.current, e)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        escapeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusableIn(ref.current);
      e.stopPropagation();
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !ref.current?.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !ref.current?.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown, true);
      opener?.focus?.();
    };
  }, [active, ref, initialFocus]);
}
