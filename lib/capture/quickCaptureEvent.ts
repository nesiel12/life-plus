// How anything in the app opens Quick Capture without holding a reference to
// it. Same shape as lib/companion/sosEvent.ts: a window event carries no state,
// so nothing lingers once it has been handled.

export const QUICK_CAPTURE_EVENT = "atlas:quick-capture";

export function requestQuickCapture(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(QUICK_CAPTURE_EVENT));
}
