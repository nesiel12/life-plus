import { describe, expect, it } from "vitest";
import { resolveChatProvider } from "@/lib/ai/resolveChatProvider";

describe("resolveChatProvider", () => {
  it("returns null when no key is configured", () => {
    expect(resolveChatProvider({})).toBeNull();
  });

  it("prefers OpenAI when both keys are configured", () => {
    expect(resolveChatProvider({ openaiKey: "sk-test", geminiKey: "gemini-test" })).toBe("openai");
  });

  it("uses OpenAI when only the OpenAI key is set", () => {
    expect(resolveChatProvider({ openaiKey: "sk-test" })).toBe("openai");
  });

  it("falls back to Gemini when only the Gemini key is set", () => {
    expect(resolveChatProvider({ geminiKey: "gemini-test" })).toBe("gemini");
  });

  it("treats an empty-string key the same as unset", () => {
    expect(resolveChatProvider({ openaiKey: "", geminiKey: "" })).toBeNull();
  });
});
