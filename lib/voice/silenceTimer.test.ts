import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSilenceTimer } from "@/lib/voice/silenceTimer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startSilenceTimer", () => {
  it("fires once the configured silence window elapses with no activity", () => {
    const onSilence = vi.fn();
    startSilenceTimer(700, onSilence);

    vi.advanceTimersByTime(699);
    expect(onSilence).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSilence).toHaveBeenCalledTimes(1);
  });

  it("does not fire early", () => {
    const onSilence = vi.fn();
    startSilenceTimer(700, onSilence);

    vi.advanceTimersByTime(500);
    expect(onSilence).not.toHaveBeenCalled();
  });

  it("ping() restarts the countdown from the top — the fast turn-taking behavior itself", () => {
    const onSilence = vi.fn();
    const handle = startSilenceTimer(700, onSilence);

    // A sign of continued speech arrives just before the deadline, over and
    // over — this is exactly what a stream of interim recognition results
    // (or a sustained above-threshold mic level) does while someone is
    // still mid-sentence.
    vi.advanceTimersByTime(600);
    handle.ping();
    vi.advanceTimersByTime(600);
    handle.ping();
    vi.advanceTimersByTime(600);
    expect(onSilence).not.toHaveBeenCalled();

    // Now silence for the full window: fires.
    vi.advanceTimersByTime(700);
    expect(onSilence).toHaveBeenCalledTimes(1);
  });

  it("fires exactly once even if the window elapses more than once", () => {
    const onSilence = vi.fn();
    startSilenceTimer(700, onSilence);

    vi.advanceTimersByTime(700);
    vi.advanceTimersByTime(700);
    vi.advanceTimersByTime(700);

    expect(onSilence).toHaveBeenCalledTimes(1);
  });

  it("a ping after it has already fired is a no-op — does not fire again", () => {
    const onSilence = vi.fn();
    const handle = startSilenceTimer(700, onSilence);

    vi.advanceTimersByTime(700);
    expect(onSilence).toHaveBeenCalledTimes(1);

    handle.ping();
    vi.advanceTimersByTime(700);
    expect(onSilence).toHaveBeenCalledTimes(1);
  });

  it("cancel() stops it from ever firing", () => {
    const onSilence = vi.fn();
    const handle = startSilenceTimer(700, onSilence);

    vi.advanceTimersByTime(400);
    handle.cancel();
    vi.advanceTimersByTime(1000);

    expect(onSilence).not.toHaveBeenCalled();
  });

  it("ping() after cancel() does not resurrect it", () => {
    const onSilence = vi.fn();
    const handle = startSilenceTimer(700, onSilence);

    handle.cancel();
    handle.ping();
    vi.advanceTimersByTime(1000);

    expect(onSilence).not.toHaveBeenCalled();
  });
});
