// The cross-module intelligence engine: rules that connect one area of the app
// to another, so they act as one system instead of ten silos.
//
// Each rule is a small pure module with its own tests; the UI only renders
// what they return. None of them sends, writes or stores anything — they decide
// and draft, and a person presses the button.
//
//   Health   <-> Tasks    energyTasks    circadian energy -> which tasks to surface
//   Family   <-> WhatsApp familyOutreach neglected contact -> a message one tap from sent
//   Recovery <-> SOS      sosTrigger     any "קשה לי עכשיו" entry -> the Companion, offline
//   Torah    <-> Shabbat  shabbatQr      a printed lesson -> a QR back to the digital one

export {
  classifyTaskDemand,
  recommendTasks,
  taskFit,
  taskUrgency,
  type TaskDemand,
  type TaskFit,
  type TaskRecommendation,
  type TaskUrgency,
} from "@/lib/intelligence/crossModule/energyTasks";

export {
  buildOutreachDrafts,
  familyCheckIns,
  inferRole,
  type OutreachDraft,
} from "@/lib/intelligence/crossModule/familyOutreach";

export { triggerCompanionSos } from "@/lib/intelligence/crossModule/sosTrigger";

// shabbatQr is deliberately NOT re-exported here. It pulls in the QR library,
// and this barrel is imported by client components (the dashboard cards);
// re-exporting it would ship the encoder to every browser to serve a page that
// renders on the server. Import it directly:
//   @/lib/intelligence/crossModule/shabbatQr
