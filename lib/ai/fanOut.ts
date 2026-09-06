// A ceiling on how many model calls one request may make.
//
// Exists because a request that loops over user data and calls a model per
// item has no natural bound — the quota stops it eventually, but only after
// it has already spent everything in a single click. photos/memories was the
// one such path in the app, and its only limit was a display constant
// (`maxResults`), so widening the card would silently have widened the bill.
//
// Named and pure so the ceiling is a decision with a test rather than a
// decrementing integer buried in a map callback.

export interface FanOutBudget {
  /** Claims one call. False once the ceiling is reached. */
  take(): boolean;
  /** Calls still available. */
  readonly remaining: number;
}

export function createFanOutBudget(max: number): FanOutBudget {
  // A negative or nonsense ceiling means "none", never "unlimited" — the
  // safe direction for something whose failure mode is spending money.
  let left = Number.isFinite(max) && max > 0 ? Math.floor(max) : 0;
  return {
    take() {
      if (left <= 0) return false;
      left -= 1;
      return true;
    },
    get remaining() {
      return left;
    },
  };
}
