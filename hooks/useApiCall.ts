"use client";

import { useCallback, useState } from "react";

interface UseApiCallResult<Args extends unknown[]> {
  loading: boolean;
  error: string | null;
  run: (...args: Args) => Promise<void>;
}

// Wraps the loading/error bookkeeping around an async action so components
// don't each hand-roll their own try/finally/setLoading. Previously this
// pattern was implemented three times, inconsistently — one of the three
// (GoalsPanel) had no error handling at all (docs/TECH_DEBT.md #13, #10).
//
// `run` rethrows after recording `error`, so callers get both: a generic
// `error` string to render inline if that's all they need, and a normal
// try/catch around `run()` if they want bespoke handling (e.g. AICompanion
// turning a failure into a chat bubble instead of an inline error).
// The action's resolved value is deliberately unconstrained: this hook only
// tracks loading/error and discards the result, so requiring Promise<void>
// forced callers with a genuinely useful return (addSummary returns the
// created row) to wrap it in a throwaway lambda.
export function useApiCall<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>
): UseApiCallResult<Args> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args) => {
      setLoading(true);
      setError(null);
      try {
        await action(...args);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [action]
  );

  return { loading, error, run };
}
