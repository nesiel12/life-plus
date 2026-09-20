import { requestCompanionSos } from "@/lib/companion/sosEvent";

// Recovery / Personal Space <-> the Companion's SOS mode.
//
// One function, on purpose: every "קשה לי עכשיו" entry point outside the
// Companion itself goes through it, so there is a single place that can be
// held to the rule those moments need — nothing leaves the device. It
// dispatches a window event (lib/companion/sosEvent.ts) and does nothing else:
// no fetch, no store write, no storage, no logging. The Companion listens and
// opens SosPanel, which is equally inert.
//
// The recovery space's own support sheet (components/features/recovery/
// SupportSheet.tsx) is a richer, program-aware flow and stays what its button
// opens once unlocked; this is for the moment *before* that — the lock screen,
// where someone in distress should not have to authenticate to get a calming
// screen.
export function triggerCompanionSos(): void {
  requestCompanionSos();
}
