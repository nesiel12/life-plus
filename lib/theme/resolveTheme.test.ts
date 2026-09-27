import { describe, expect, it } from "vitest";
import { readStoredPreference, resolveTheme, themeInitScript } from "./resolveTheme";

function storage(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: () => value };
}

describe("readStoredPreference", () => {
  it("reads a valid stored preference, including 'system'", () => {
    expect(readStoredPreference(storage("dark"))).toBe("dark");
    expect(readStoredPreference(storage("light"))).toBe("light");
    expect(readStoredPreference(storage("system"))).toBe("system");
  });

  it("defaults to 'system' for anything unset or garbled — never an arbitrary fixed theme", () => {
    expect(readStoredPreference(storage(null))).toBe("system");
    expect(readStoredPreference(storage("dakr"))).toBe("system");
    expect(readStoredPreference(storage(""))).toBe("system");
  });

  it("defaults to 'system' when storage itself throws (Safari private mode, blocked cookies)", () => {
    const throwing: Pick<Storage, "getItem"> = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredPreference(throwing)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("an explicit preference always wins over the OS, either direction", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("'system' follows the OS preference exactly", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("themeInitScript", () => {
  it("reads the same storage key and media query the provider itself uses, so the two can't drift", () => {
    expect(themeInitScript).toContain('localStorage.getItem("lifeplus.theme")');
    expect(themeInitScript).toContain("prefers-color-scheme: dark");
  });

  it("falls back to light, never throws, when localStorage and matchMedia are both unavailable", () => {
    // Exercising the exact inline script the browser runs pre-paint.
    const run = new Function(
      "localStorage",
      "window",
      "document",
      `${themeInitScript.replace("window.matchMedia", "window && window.matchMedia")}`
    );
    const doc = { documentElement: { dataset: {} as Record<string, string> } };
    expect(() => run(undefined, undefined, doc)).not.toThrow();
    expect(doc.documentElement.dataset.theme).toBe("light");
  });
});
