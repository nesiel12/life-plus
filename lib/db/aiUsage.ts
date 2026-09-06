import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Budget, QuotaScope } from "@/lib/ai/quota";

// The only way the application touches the AI quota counters.
//
// Both calls are Postgres functions rather than table reads and writes, and
// that is the whole point: the check and the charge have to happen inside one
// transaction or concurrent requests slip past the limit. See the migration
// for the reasoning in full.
//
// This is the codebase's first use of .rpc(). It is a deliberate exception to
// the repo-per-table pattern, not a drift away from it — there is no way to
// express a conditional atomic increment through PostgREST's table API.

export interface ConsumeResult {
  allowed: boolean;
  /** Which budget ran out. Only set when `allowed` is false. */
  rejectedScope: QuotaScope | null;
  used: number | null;
  cap: number | null;
}

interface ConsumeRow {
  allowed: boolean;
  rejected_scope: string | null;
  used: number | null;
  cap: number | null;
}

/**
 * Charges every budget, or none of them.
 *
 * Fails closed. If the database is unreachable the request is refused rather
 * than waved through: the counter is the only thing standing between an
 * authenticated stranger and the owner's API bill, and "the quota service is
 * down" is exactly when an abuser would be hammering it.
 */
export async function consumeAiUnits(userId: string, budgets: Budget[]): Promise<ConsumeResult> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("consume_ai_units", {
    p_user_id: userId,
    p_budgets: budgets.map((b) => ({
      scope: b.scope,
      window: b.window,
      cost: b.cost,
      limit: b.limit,
    })),
  });

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as ConsumeRow | undefined;
  if (!row) {
    // The function always returns exactly one row. Nothing back means
    // something is wrong with the deployment, not that the user is clear.
    throw new Error("consume_ai_units returned no row");
  }

  return {
    allowed: row.allowed,
    rejectedScope: (row.rejected_scope as QuotaScope | null) ?? null,
    used: row.used,
    cap: row.cap,
  };
}

/**
 * Settles a reservation against actual usage.
 *
 * Best-effort by design. This runs after the model call has already
 * succeeded, so a failure here must not turn a completed transcription into
 * an error the user sees — the worst case is that they were charged the
 * estimate instead of the true figure.
 */
export async function adjustAiUnits(
  userId: string,
  scope: QuotaScope,
  window: string,
  delta: number
): Promise<void> {
  if (delta === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.rpc("adjust_ai_units", {
    p_user_id: userId,
    p_scope: scope,
    p_window: window,
    p_delta: delta,
  });
  if (error) {
    console.error("[aiUsage] settle failed; estimate stands:", error);
  }
}

/** Current usage for a user, for showing remaining quota. Read-only. */
export async function readAiUsage(
  userId: string,
  scope: QuotaScope,
  window: string
): Promise<number> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("ai_usage")
    .select("units")
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("window_start", window)
    .maybeSingle();
  if (error) throw error;
  return data?.units ?? 0;
}
