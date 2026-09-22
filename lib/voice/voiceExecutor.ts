import { describeVoiceAction, type VoiceRoutedAction } from "@/lib/voice/multiIntentParser";

// Turns one routed action into a real write and the means of undoing it —
// the Voice Companion's analogue of lib/ai/quickLog.ts's executeAutoAction,
// pulled into its own module for the same reason: every "how do we take this
// back" decision lives here, injected rather than importing the store
// directly, so it is unit-testable with plain fakes and hooks/
// useVoiceCompanion.ts (the only real caller) supplies the actual store
// actions.

export interface VoiceCompanionActions {
  addTask(input: { title: string; dueDate?: string; isHighPriority?: boolean }): Promise<{ id: string }>;
  deleteTask(id: string): Promise<void>;
  addTransaction(input: { amount: number; type: "expense"; title: string; category: string }): Promise<{ id: string }>;
  deleteTransaction(id: string): Promise<void>;
  updateLearningResource(resourceId: string, patch: { isCompleted: boolean }): Promise<void>;
  /** Synchronous snapshot lookup — the caller already holds the full people list in state. */
  findPerson(personId: string): { note?: string; lastMeaningfulInteraction?: string } | undefined;
  logPersonInteraction(personId: string, note?: string): Promise<void>;
  updatePerson(personId: string, patch: { note?: string; lastMeaningfulInteraction?: string }): Promise<void>;
  addMoment(input: { category: "general"; title: string; content: string }): Promise<{ id: string }>;
  deleteMoment(id: string): Promise<void>;
}

export interface ExecutedVoiceAction {
  action: VoiceRoutedAction;
  summary: string;
  /** Rejects if the removal did not go through; safe to call more than once. */
  undo: () => Promise<void>;
}

/**
 * Performs the write and returns its undo. Returns null for an action with
 * nothing left to do — a LEARNING_PROGRESS whose topic has no incomplete
 * resource left, so there is no write and correspondingly no undo — rather
 * than writing something fabricated just to have an id to remove.
 */
export async function executeVoiceAction(action: VoiceRoutedAction, actions: VoiceCompanionActions): Promise<ExecutedVoiceAction | null> {
  const summary = describeVoiceAction(action);

  switch (action.intent) {
    case "TASK_CREATE": {
      const { id } = await actions.addTask({
        title: action.payload.title,
        dueDate: action.payload.dueAt,
        isHighPriority: action.payload.priority === "high",
      });
      return { action, summary, undo: () => actions.deleteTask(id) };
    }

    case "EXPENSE_LOG": {
      const { id } = await actions.addTransaction({
        amount: action.payload.amount,
        type: "expense",
        title: action.payload.title,
        category: action.payload.category,
      });
      return { action, summary, undo: () => actions.deleteTransaction(id) };
    }

    case "LEARNING_PROGRESS": {
      const { resourceId } = action.payload;
      if (!resourceId) return null;
      await actions.updateLearningResource(resourceId, { isCompleted: true });
      return { action, summary, undo: () => actions.updateLearningResource(resourceId, { isCompleted: false }) };
    }

    case "FAMILY_NOTE": {
      // Captured before the write: logPersonInteraction overwrites `note` and
      // re-stamps `lastMeaningfulInteraction` to now, so undoing it means
      // restoring exactly what was there before — not calling the same
      // action again, which would just stamp "now" a second time.
      const prior = actions.findPerson(action.payload.personId);
      await actions.logPersonInteraction(action.payload.personId, action.payload.noteText);
      return {
        action,
        summary,
        undo: () => actions.updatePerson(action.payload.personId, { note: prior?.note, lastMeaningfulInteraction: prior?.lastMeaningfulInteraction }),
      };
    }

    case "NOTE_CAPTURE": {
      const content =
        action.payload.tags.length > 0 ? `${action.payload.content}\n\n${action.payload.tags.map((t) => `#${t}`).join(" ")}` : action.payload.content;
      const created = await actions.addMoment({ category: "general", title: action.payload.title, content });
      return { action, summary, undo: () => actions.deleteMoment(created.id) };
    }
  }
}
