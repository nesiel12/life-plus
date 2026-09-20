import type { LifeAreaKey, MomentCategory } from "@/types";

// The client's view of a command proposal: what /api/commands/interpret sends
// back, and what the Command Panel knows how to render, confirm and record.
// Pure types, so both the panel and lib/ai/quickLog.ts (which builds the same
// shape from a FAB result) can share it without lib/ importing a component.

export type CommandPeriod = "morning" | "afternoon" | "evening" | "night";
export type CommandDay = "today" | "tomorrow";

export interface CalendarEventProposal {
  googleEventId: string;
  /** Absent on proposals produced before multi-calendar support, which were
   *  all necessarily on the primary calendar. */
  calendarId?: string;
  title: string;
  start: string;
  end: string;
}

export interface CommandProposal {
  type: "add_moment" | "add_goal" | "log_family_interaction" | "clear_calendar_range";
  recommendationEventId: string;
  addMoment?: { category: MomentCategory; title: string; content: string };
  addGoal?: { title: string; category: LifeAreaKey };
  logFamilyInteraction?: { personId: string; personName: string; note?: string };
  clearCalendarRange?: { period: CommandPeriod; day: CommandDay; events: CalendarEventProposal[] };
}
