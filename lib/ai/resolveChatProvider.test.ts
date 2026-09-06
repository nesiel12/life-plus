import { describe, expect, it } from "vitest";
import { resolveChatProvider } from "@/lib/ai/resolveChatProvider";

describe("resolveChatProvider", () => {
  it("returns null when no key is configured", () => {
    expect(resolveChatProvider({})).toBeNull();
  });

  // Gemini is primary: cheaper and faster for this app's short-generation
  // workload. OpenAI stays configured specifically as the fallback that
  // getChatModelChain() reaches on a genuine capacity failure.
  it("prefers Gemini when both keys are configured", () => {
    expect(resolveChatProvider({ openaiKey: "sk-test", geminiKey: "gemini-test" })).toBe("gemini");
  });

  it("uses Gemini when only the Gemini key is set", () => {
    expect(resolveChatProvider({ geminiKey: "gemini-test" })).toBe("gemini");
  });

  it("falls back to OpenAI when only the OpenAI key is set", () => {
    expect(resolveChatProvider({ openaiKey: "sk-test" })).toBe("openai");
  });

  it("treats an empty-string key the same as unset", () => {
    expect(resolveChatProvider({ openaiKey: "", geminiKey: "" })).toBeNull();
  });
});
