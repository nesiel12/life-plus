// The clarification-loop message composer.
//
// Lives here rather than in lib/ai/agents/calendarAgent.ts because that
// module is `server-only` (it calls generateStructuredData), and the panel
// that needs this — components/features/calendar/CalendarAgentPanel.tsx — is
// a client component. Pure string composition with no server dependency, so
// it belongs on the client-safe side of that boundary.

export interface ClarificationTurn {
  /** The agent's question. */
  question: string;
  /** What the user answered. */
  answer: string;
}

/**
 * Folds a clarification exchange back into a single request string.
 *
 * The agent is stateless by design (one message in, one resolution out —
 * see resolveCalendarIntent), so answering "מחר ב-3" to "באיזה יום?" has to
 * carry its own context or the agent has no idea what "3" refers to. Rather
 * than give the route a conversation API it doesn't need, the panel replays
 * the thread as one self-contained message.
 */
export function buildClarifiedMessage(original: string, turns: ClarificationTurn[]): string {
  if (turns.length === 0) return original;
  return [
    `הבקשה המקורית: ${original}`,
    ...turns.flatMap((turn) => [`שאלת הבהרה: ${turn.question}`, `תשובת המשתמש: ${turn.answer}`]),
    "",
    "על סמך כל מה שנאמר עד כה, קבע את האירוע. אל תשאל שוב על פרט שכבר נענה.",
  ].join("\n");
}
