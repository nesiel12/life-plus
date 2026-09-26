// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

async function freshModule() {
  vi.resetModules();
  return import("./installPrompt");
}

describe("isIosDevice", () => {
  it("recognizes iPhone and iPad user agents", async () => {
    const { isIosDevice } = await freshModule();
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", "iPad", 5)).toBe(true);
  });

  it("recognizes iPadOS, which reports itself as a Mac with touch", async () => {
    const { isIosDevice } = await freshModule();
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true);
  });

  it("does not treat a real Mac or Android as iOS", async () => {
    const { isIosDevice } = await freshModule();
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)", "Linux armv8l", 5)).toBe(false);
  });
});

describe("beforeinstallprompt capture", () => {
  afterEach(() => vi.restoreAllMocks());

  it("captures the prompt, suppresses the mini-infobar, and can show it exactly once", async () => {
    const mod = await freshModule();
    const { renderHook, act } = await import("@/lib/testing/renderHook");
    const { result } = renderHook(() => mod.useInstallState());
    expect(result.current.kind).toBe("unavailable");

    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    act(() => void window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.kind).toBe("prompt");

    let accepted = false;
    await act(async () => {
      if (result.current.kind === "prompt") accepted = await result.current.prompt();
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(accepted).toBe(true);
    expect(result.current.kind).toBe("unavailable");
  });

  it("hides once the app is installed", async () => {
    const mod = await freshModule();
    const { renderHook, act } = await import("@/lib/testing/renderHook");
    const { result } = renderHook(() => mod.useInstallState());
    act(() => void window.dispatchEvent(new Event("appinstalled")));
    expect(result.current.kind).toBe("installed");
  });
});
