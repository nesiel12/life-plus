import {
  describeFabAction,
  isSosMessage,
  type AutoAction,
  type ConfirmAction,
  type FabRouteResponse,
} from "@/lib/ai/fabIntents";
import type { CommandProposal } from "@/lib/commands/proposal";

// The client half of the FAB (lib/ai/fabRouter.ts is the server half): takes
// one line of text and carries it all the way to an outcome the Companion can
// render. Kept free of React and of the store so the rules that matter — SOS
// never reaches the network, every auto write comes with a working undo,
// nothing doubtful is written — are unit-testable with plain fakes.

export const QUICK_LOG_FRIENDLY_ERROR = "לא הצלחתי להתחבר כרגע. נסה שוב עוד רגע.";
const SAVE_FAILED = "הרישום לא נשמר. נסה שוב.";

/** A failure whose message is already fit to show — e.g. the quota explanation. */
export class FabRequestError extends Error {
  constructor(
    message: string,
    readonly quotaExceeded = false
  ) {
    super(message);
    this.name = "FabRequestError";
  }
}

/**
 * The writes an auto-mode result performs, and how to take each back. Injected
 * so this module never imports the store: the Companion supplies the real
 * store actions, and tests supply fakes.
 */
export interface QuickLogActions {
  addTask(input: { title: string; dueDate?: string; isHighPriority?: boolean }): Promise<{ id: string }>;
  deleteTask(id: string): Promise<void>;
  addTransaction(input: {
    amount: number;
    type: "expense";
    title: string;
    category: string;
  }): Promise<{ id: string }>;
  deleteTransaction(id: string): Promise<void>;
  logWater(amountMl: number): Promise<{ id: string }>;
  deleteWater(id: string): Promise<void>;
}

export interface QuickLogDeps {
  /** POST /api/fab. Throws FabRequestError for a failure worth explaining. */
  route: (text: string) => Promise<FabRouteResponse>;
  actions: QuickLogActions;
}

export interface UndoableLog {
  summary: string;
  /** Rejects if the removal did not go through; safe to call more than once. */
  undo: () => Promise<void>;
}

/** Everything the Command Panel needs to show a ready-made proposal turn. */
export interface ProposalTurn {
  commandText: string;
  reply: string;
  proposal: CommandProposal;
}

export type QuickLogOutcome =
  | { kind: "sos" }
  | ({ kind: "logged" } & UndoableLog)
  | ({ kind: "proposal" } & ProposalTurn)
  | { kind: "handoff"; text: string }
  | { kind: "reply"; reply: string }
  | { kind: "error"; message: string };

/**
 * Performs an auto-mode action right now and returns the means of undoing it.
 * The id of what was created is what makes the undo exact: it removes that
 * row, not "the latest task", so an undo can never delete something the user
 * added in the meantime.
 */
export async function executeAutoAction(action: AutoAction, actions: QuickLogActions): Promise<UndoableLog> {
  const summary = describeFabAction(action);
  let remove: () => Promise<void>;

  switch (action.intent) {
    case "LOG_WATER": {
      const { id } = await actions.logWater(action.payload.amountMl);
      remove = () => actions.deleteWater(id);
      break;
    }
    case "LOG_EXPENSE": {
      const { id } = await actions.addTransaction({
        amount: action.payload.amount,
        type: "expense",
        title: action.payload.title,
        category: action.payload.category,
      });
      remove = () => actions.deleteTransaction(id);
      break;
    }
    case "ADD_TASK": {
      const { id } = await actions.addTask({
        title: action.payload.title,
        dueDate: action.payload.dueAt,
        isHighPriority: action.payload.priority === "high",
      });
      remove = () => actions.deleteTask(id);
      break;
    }
  }

  // Memoised so a double-click on "בטל" removes once. A failed removal clears
  // the memo: the user should be able to try again.
  let pending: Promise<void> | null = null;
  return {
    summary,
    undo: () => {
      pending ??= remove().catch((err) => {
        pending = null;
        throw err;
      });
      return pending;
    },
  };
}

/**
 * A confirm-mode result, expressed as the proposal the Command Panel already
 * knows how to render, approve, execute and record an outcome for — so the
 * FAB adds no second confirm UI and no second execution path.
 */
export function toProposalTurn(
  action: ConfirmAction,
  recommendationEventId: string,
  commandText: string
): ProposalTurn {
  const reply = `${describeFabAction(action)} — לאשר?`;

  if (action.intent === "TORAH_INSIGHT") {
    return {
      commandText,
      reply,
      proposal: {
        type: "add_moment",
        recommendationEventId,
        addMoment: { category: "faith", title: action.payload.title, content: action.payload.content },
      },
    };
  }

  return {
    commandText,
    reply,
    proposal: {
      type: "log_family_interaction",
      recommendationEventId,
      logFamilyInteraction: {
        personId: action.payload.personId,
        personName: action.payload.personName,
        note: action.payload.note,
      },
    },
  };
}

export async function runQuickLog(rawText: string, deps: QuickLogDeps): Promise<QuickLogOutcome> {
  const text = rawText.trim();
  if (!text) return { kind: "error", message: "אין מה לרשום." };

  // Before anything else, and before `deps.route` can be reached: a distress
  // message is never sent over the network, so it cannot be logged, charged,
  // or shown to a model. The server repeats this check as a backstop, but this
  // is the one that keeps the text on the device.
  if (isSosMessage(text)) return { kind: "sos" };

  let response: FabRouteResponse;
  try {
    response = await deps.route(text);
  } catch (err) {
    return { kind: "error", message: err instanceof FabRequestError ? err.message : QUICK_LOG_FRIENDLY_ERROR };
  }

  switch (response.mode) {
    case "sos":
      // The server's backstop caught something the local matcher did not.
      return { kind: "sos" };
    case "auto":
      try {
        return { kind: "logged", ...(await executeAutoAction(response.action, deps.actions)) };
      } catch {
        return { kind: "error", message: SAVE_FAILED };
      }
    case "confirm":
      return { kind: "proposal", ...toProposalTurn(response.action, response.recommendationEventId, text) };
    case "reply":
      return { kind: "reply", reply: response.reply };
    case "handoff":
      return { kind: "handoff", text };
  }
}
