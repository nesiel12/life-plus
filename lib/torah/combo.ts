// Combo streaks for "קרב חברותא" — the gamified practice session.
//
// Pure: the session component feeds each result in and renders what comes
// out. The rules are deliberately generous with the learner's effort and
// strict only about real forgetting:
//   • a clean recall (good/easy, or a written answer ≥ 70) builds the streak;
//   • a shaky one ("hard", or 40–69) HOLDS it — struggling to remember is
//     still remembering, and punishing it teaches people to over-grade;
//   • forgetting ("again", or < 40) breaks it.
// Multipliers apply to the XP a round earns; the difference from the base is
// the session's bonus, the one number stored (practice_sessions.bonus_xp).

import type { SrsAnswer } from "@/lib/torah/srs";

export const COMBO_TIERS = [
  { at: 0, multiplier: 1 },
  { at: 3, multiplier: 1.5 },
  { at: 5, multiplier: 2 },
  { at: 8, multiplier: 3 },
] as const;

/** The server refuses more than this per session (and the table caps at 500). */
export const MAX_SESSION_BONUS = 500;
/** No single round can be worth more bonus than this — the server checks it too. */
export const MAX_BONUS_PER_ROUND = 30;

export type RoundOutcome = "clean" | "shaky" | "miss";

export interface ComboState {
  streak: number;
  best: number;
  rounds: number;
  correct: number;
  baseXp: number;
  bonusXp: number;
}

export interface ComboStep {
  state: ComboState;
  /** XP this round earned, multiplier included. */
  gained: number;
  multiplier: number;
  /** The streak just crossed into a higher tier — the moment to celebrate. */
  tierUp: boolean;
  /** A streak of 2+ was just lost. */
  broke: boolean;
}

export function initialCombo(): ComboState {
  return { streak: 0, best: 0, rounds: 0, correct: 0, baseXp: 0, bonusXp: 0 };
}

export function multiplierFor(streak: number): number {
  let multiplier = 1;
  for (const tier of COMBO_TIERS) if (streak >= tier.at) multiplier = tier.multiplier;
  return multiplier;
}

export function outcomeForAnswer(answer: SrsAnswer): RoundOutcome {
  return answer === "again" ? "miss" : answer === "hard" ? "shaky" : "clean";
}

export function outcomeForScore(score: number | null): RoundOutcome {
  if (score === null) return "shaky";
  return score >= 70 ? "clean" : score >= 40 ? "shaky" : "miss";
}

export function applyRound(state: ComboState, outcome: RoundOutcome, baseXp: number): ComboStep {
  const streak = outcome === "clean" ? state.streak + 1 : outcome === "miss" ? 0 : state.streak;
  const multiplier = outcome === "miss" ? 1 : multiplierFor(streak);
  const base = Math.max(0, Math.round(baseXp));
  const bonus = Math.min(MAX_BONUS_PER_ROUND, Math.round(base * multiplier) - base);
  const gained = base + bonus;
  const next: ComboState = {
    streak,
    best: Math.max(state.best, streak),
    rounds: state.rounds + 1,
    correct: state.correct + (outcome === "miss" ? 0 : 1),
    baseXp: state.baseXp + base,
    bonusXp: Math.min(MAX_SESSION_BONUS, state.bonusXp + bonus),
  };
  return {
    state: next,
    gained,
    multiplier,
    tierUp: multiplierFor(streak) > multiplierFor(state.streak),
    broke: outcome === "miss" && state.streak >= 2,
  };
}

/** 0..1 toward the next tier, for the flame's progress arc. Full at the top tier. */
export function progressToNextTier(streak: number): number {
  const next = COMBO_TIERS.find((tier) => tier.at > streak);
  if (!next) return 1;
  const current = [...COMBO_TIERS].reverse().find((tier) => tier.at <= streak) ?? COMBO_TIERS[0];
  return (streak - current.at) / (next.at - current.at);
}
