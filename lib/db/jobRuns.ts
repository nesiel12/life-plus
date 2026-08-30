import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { JobName } from "@/lib/proactive/types";

/**
 * The Proactive Engine's execution ledger. `claim` is the idempotency gate:
 * it inserts a `running` row on the unique (job_name, scope_key, run_date)
 * index. If a row already exists it returns null unless the prior run failed
 * (in which case the caller may retry).
 */
export const jobRunsRepo = {
  async claim(jobName: JobName, scopeKey: string, runDate: string): Promise<string | null> {
    const client = getSupabaseClient();

    const { data: existing, error: readErr } = await client
      .from("job_runs")
      .select("id, status")
      .eq("job_name", jobName)
      .eq("scope_key", scopeKey)
      .eq("run_date", runDate)
      .maybeSingle();
    if (readErr) throw readErr;

    if (existing) {
      if (existing.status === "failed") {
        await client.from("job_runs").update({ status: "running", started_at: new Date().toISOString(), finished_at: null }).eq("id", existing.id);
        return existing.id;
      }
      return null; // succeeded / running / skipped — nothing to do
    }

    const { data, error } = await client
      .from("job_runs")
      .insert({ job_name: jobName, scope_key: scopeKey, run_date: runDate, status: "running" })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return null; // lost a race — another worker claimed it
      throw error;
    }
    return data.id;
  },

  async finish(
    id: string,
    status: "succeeded" | "failed" | "skipped",
    itemsProduced = 0,
    detail: Record<string, unknown> = {}
  ): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("job_runs")
      .update({ status, items_produced: itemsProduced, detail, finished_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
