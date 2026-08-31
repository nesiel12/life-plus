/**
 * Race a promise against a timeout. Proactive jobs run unattended on a
 * schedule — a hung dependency (a slow or misconfigured AI provider, a stuck
 * network call) must never wedge the whole sweep. On timeout this rejects with
 * a `TimeoutError`; the caller decides whether that's fatal or a fallback path.
 */
export class TimeoutError extends Error {
  constructor(ms: number, label?: string) {
    super(`${label ?? "operation"} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
