// How anything in the app opens the AI Companion in SOS mode ("קשה לי עכשיו").
//
// A DOM event rather than store state on purpose. SOS mode is meant to leave
// nothing behind, and the store is what gets persisted and mirrored to the
// server; a window event is gone the moment it has been handled. It also lets
// a surface that has no reference to the Companion (a dashboard input, the
// Personal Space page, a future Intelligence Engine rule) ask for it without
// importing it.

export const COMPANION_SOS_EVENT = "atlas:companion-sos";

export function requestCompanionSos(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COMPANION_SOS_EVENT));
}
