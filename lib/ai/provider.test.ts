import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getChatModelChain() reads process.env directly (not module-load-time
// state), so re-importing after vi.stubEnv/vi.resetModules exercises it
// exactly as a real request would with whatever keys are actually
// configured — the same pattern lib/sessionCookie.test.ts uses.

interface Env {
  groq?: string;
  cerebras?: string;
  sambanova?: string;
  gemini?: string;
  bytez?: string;
  openai?: string;
  openrouter?: string;
}

const ENV_VAR: Record<keyof Env, string> = {
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  sambanova: "SAMBANOVA_API_KEY",
  gemini: "GEMINI_API_KEY",
  bytez: "BYTEZ_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

async function chainWith(env: Env) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value) vi.stubEnv(ENV_VAR[key as keyof Env], value);
  }
  const { getChatModelChain } = await import("@/lib/ai/provider");
  return getChatModelChain();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("getChatModelChain", () => {
  it("orders Groq, Cerebras, SambaNova, then Gemini (two models deep) when all are configured", async () => {
    const chain = await chainWith({ groq: "g", cerebras: "c", sambanova: "s", gemini: "gem" });
    expect(chain.map((c) => c.label.split(":")[0])).toEqual(["groq", "cerebras", "sambanova", "gemini", "gemini"]);
    expect(chain.every((c) => c.kind === "sdk")).toBe(true);
  });

  it("skips any tier whose own key is unset, keeping the rest in order", async () => {
    const chain = await chainWith({ groq: "g", gemini: "gem" });
    expect(chain.map((c) => c.label.split(":")[0])).toEqual(["groq", "gemini", "gemini"]);
  });

  it("places OpenRouter strictly last, after every other configured tier", async () => {
    const chain = await chainWith({ groq: "g", gemini: "gem", openrouter: "or" });
    expect(chain[chain.length - 1].label.split(":")[0]).toBe("openrouter");
  });

  it("OpenRouter's wired model id is always a free model", async () => {
    const chain = await chainWith({ openrouter: "or" });
    const openrouter = chain.find((c) => c.label.startsWith("openrouter:"));
    expect(openrouter).toBeDefined();
    expect(openrouter!.label.endsWith(":free")).toBe(true);
  });

  it("includes Bytez, and only Bytez, as a bytez-kind candidate when configured", async () => {
    const chain = await chainWith({ gemini: "gem", bytez: "b" });
    const bytez = chain.filter((c) => c.kind === "bytez");
    expect(bytez).toHaveLength(1);
    expect(bytez[0].label).toMatch(/^bytez:/);
  });

  it("a bytez candidate carries a modelId, never a LanguageModel", async () => {
    const chain = await chainWith({ bytez: "b" });
    const bytez = chain.find((c) => c.kind === "bytez");
    expect(bytez).toBeDefined();
    if (bytez?.kind === "bytez") {
      expect(typeof bytez.modelId).toBe("string");
      expect(bytez.modelId.length).toBeGreaterThan(0);
    }
  });

  it("includes OpenAI, when configured, only as a tail candidate after the five named tiers", async () => {
    const chain = await chainWith({ groq: "g", openai: "o", openrouter: "or" });
    const kinds = chain.map((c) => c.label.split(":")[0]);
    expect(kinds.indexOf("openai")).toBeGreaterThan(kinds.indexOf("groq"));
    expect(kinds.indexOf("openrouter")).toBeGreaterThan(kinds.indexOf("openai"));
  });

  it("is empty when nothing is configured — never a phantom fallback candidate", async () => {
    const chain = await chainWith({});
    expect(chain).toEqual([]);
  });

  it("is stable and repeatable for the exact env this app actually ships with", async () => {
    // Mirrors .env.local as of 2026-09-25: everything except OPENAI_API_KEY
    // and BYTEZ_API_KEY.
    const chain = await chainWith({ groq: "g", cerebras: "c", sambanova: "s", gemini: "gem", openrouter: "or" });
    expect(chain.map((c) => c.label.split(":")[0])).toEqual(["groq", "cerebras", "sambanova", "gemini", "gemini", "openrouter"]);
  });
});

describe("isOpenRouterFreeModelId", () => {
  it("accepts a :free-suffixed id and rejects anything else", async () => {
    const { isOpenRouterFreeModelId } = await import("@/lib/ai/provider");
    expect(isOpenRouterFreeModelId("google/gemma-4-31b-it:free")).toBe(true);
    expect(isOpenRouterFreeModelId("google/gemma-4-31b-it")).toBe(false);
    expect(isOpenRouterFreeModelId("openai/gpt-4o")).toBe(false);
  });
});

describe("isProviderConfigured", () => {
  it("is true whenever the chain is non-empty, false otherwise — the same source of truth, not a separate list", async () => {
    vi.resetModules();
    vi.stubEnv("GROQ_API_KEY", "g");
    let mod = await import("@/lib/ai/provider");
    expect(mod.isProviderConfigured()).toBe(true);

    vi.resetModules();
    vi.unstubAllEnvs();
    mod = await import("@/lib/ai/provider");
    expect(mod.isProviderConfigured()).toBe(false);
  });
});
