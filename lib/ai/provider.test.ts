import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getChatModelChain() reads process.env directly (not module-load-time
// state), so re-importing after vi.stubEnv/vi.resetModules exercises it
// exactly as a real request would with whatever keys are actually
// configured — the same pattern lib/sessionCookie.test.ts uses.

async function chainWith(env: { openai?: string; gemini?: string; bytez?: string }) {
  vi.resetModules();
  if (env.openai) vi.stubEnv("OPENAI_API_KEY", env.openai);
  if (env.gemini) vi.stubEnv("GEMINI_API_KEY", env.gemini);
  if (env.bytez) vi.stubEnv("BYTEZ_API_KEY", env.bytez);
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
  it("orders Gemini, then Bytez, then OpenAI when all three keys are set", async () => {
    const chain = await chainWith({ openai: "sk-x", gemini: "g-x", bytez: "b-x" });
    expect(chain.map((c) => c.kind)).toEqual(["sdk", "bytez", "sdk", "sdk"]);
    expect(chain[0].label).toMatch(/^gemini:/);
    expect(chain[1].label).toMatch(/^bytez:/);
    expect(chain[2].label).toMatch(/^openai:/);
  });

  it("omits Bytez entirely when BYTEZ_API_KEY is unset", async () => {
    const chain = await chainWith({ openai: "sk-x", gemini: "g-x" });
    expect(chain.some((c) => c.kind === "bytez")).toBe(false);
    expect(chain[0].label).toMatch(/^gemini:/);
    expect(chain[1].label).toMatch(/^openai:/);
  });

  it("places Bytez right after Gemini even when OpenAI is entirely absent", async () => {
    const chain = await chainWith({ gemini: "g-x", bytez: "b-x" });
    expect(chain.map((c) => c.kind)).toEqual(["sdk", "bytez", "sdk"]);
    expect(chain[0].label).toMatch(/^gemini:/);
    expect(chain[1].label).toMatch(/^bytez:/);
  });

  // Gemini's key missing is the one case where OpenAI becomes primary —
  // Bytez still has to appear, or a Gemini outage would also remove
  // Atlas's only other cross-provider fallback.
  it("still includes Bytez when only OpenAI and Bytez are configured", async () => {
    const chain = await chainWith({ openai: "sk-x", bytez: "b-x" });
    expect(chain[0].label).toMatch(/^openai:/);
    expect(chain[1].label).toMatch(/^bytez:/);
    expect(chain.some((c) => c.kind === "bytez")).toBe(true);
  });

  it("never puts Bytez first — Gemini leads whenever it is configured", async () => {
    const chain = await chainWith({ gemini: "g-x", bytez: "b-x", openai: "sk-x" });
    expect(chain[0].kind).toBe("sdk");
    expect(chain[0].label).toMatch(/^gemini:/);
  });

  it("falls back to a single OpenAI candidate when nothing is configured", async () => {
    const chain = await chainWith({});
    expect(chain).toHaveLength(1);
    expect(chain[0].label).toMatch(/^openai:/);
  });

  it("a bytez candidate carries a modelId, never a LanguageModel", async () => {
    const chain = await chainWith({ gemini: "g-x", bytez: "b-x" });
    const bytez = chain.find((c) => c.kind === "bytez");
    expect(bytez).toBeDefined();
    if (bytez?.kind === "bytez") {
      expect(typeof bytez.modelId).toBe("string");
      expect(bytez.modelId.length).toBeGreaterThan(0);
    }
  });
});
