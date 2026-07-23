// Pure — deliberately no "server-only" import, unlike provider.ts itself —
// so this one piece of real decision logic (which chat provider wins when
// some combination of keys is configured) stays unit-testable, the same
// "pure module the server-only file imports from" split every other
// DB-adjacent pure module in this codebase already follows (e.g.
// lib/goals/deriveGoalStage.ts, lib/family/deriveRelationshipHealth.ts).
export type ChatProvider = "openai" | "gemini" | null;

export function resolveChatProvider(env: { openaiKey?: string; geminiKey?: string }): ChatProvider {
  if (env.openaiKey) return "openai";
  if (env.geminiKey) return "gemini";
  return null;
}
