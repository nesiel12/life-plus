import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerCompanionSos } from "@/lib/intelligence/crossModule/sosTrigger";
import { COMPANION_SOS_EVENT } from "@/lib/companion/sosEvent";

afterEach(() => vi.unstubAllGlobals());

// The claim under test is negative: opening SOS mode must leave no footprint.
// So the browser is stubbed with spies on everything that could carry one.
function stubBrowser() {
  const target = new EventTarget();
  const fetchSpy = vi.fn();
  const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
  const beacon = vi.fn();
  vi.stubGlobal("window", target);
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("navigator", { sendBeacon: beacon });
  return { target, fetchSpy, storage, beacon };
}

describe("triggerCompanionSos", () => {
  it("tells the Companion to open SOS mode", () => {
    const { target } = stubBrowser();
    const heard = vi.fn();
    target.addEventListener(COMPANION_SOS_EVENT, heard);

    triggerCompanionSos();

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("makes no request and writes no storage", () => {
    const { fetchSpy, storage, beacon } = stubBrowser();

    triggerCompanionSos();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    for (const method of Object.values(storage)) expect(method).not.toHaveBeenCalled();
  });

  it("carries no payload for a listener to read", () => {
    const { target } = stubBrowser();
    let received: Event | null = null;
    target.addEventListener(COMPANION_SOS_EVENT, (e) => (received = e));

    triggerCompanionSos();

    expect(received).toBeInstanceOf(Event);
    // A plain Event — not a CustomEvent with a detail — so there is nothing to log.
    expect(received).not.toHaveProperty("detail");
  });

  it("does nothing, quietly, where there is no window (server render)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => triggerCompanionSos()).not.toThrow();
  });
});
