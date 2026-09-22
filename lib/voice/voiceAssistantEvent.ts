// How anything in the app opens the עוזר קולי, mirroring
// lib/companion/sosEvent.ts: a DOM event rather than store state, so a
// trigger button (the Sidebar's mic icon, the mobile tab bar's) can ask for
// it without holding a reference to the globally-mounted
// VoiceAssistantModal (components/layout/AppShell.tsx) — and without a
// second copy of the modal's own microphone/audio-context state having to
// exist next to the button that opens it.

export const VOICE_ASSISTANT_OPEN_EVENT = "atlas:voice-assistant-open";

export function requestVoiceAssistant(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(VOICE_ASSISTANT_OPEN_EVENT));
}
