import { describe, expect, it } from "vitest";
import { isRetryableAiError } from "@/lib/ai/retryableError";

describe("isRetryableAiError", () => {
  describe("provider-specific structured-output schema incompatibility — worth another model even at 400", () => {
    // Live-confirmed 2026-09-25 against Groq, twice, in the exact same
    // masterclass-lesson schema: an unsupported JSON-schema "format"
    // keyword, and separately an .optional() field Groq's strict mode
    // insists must still be listed in `required`. Both are 400s that
    // would otherwise be fatal — the whole point of this classification.
    it("retries Groq's unsupported-format rejection despite the 400", () => {
      const err = Object.assign(
        new Error("invalid JSON schema for response_format: /properties/imageUrl/format: unknown or unsupported string format 'uri'"),
        { statusCode: 400 }
      );
      expect(isRetryableAiError(err)).toBe(true);
    });

    it("retries Groq's missing-optional-in-required rejection despite the 400", () => {
      const err = Object.assign(
        new Error(
          "invalid JSON schema for response_format: /properties/inlineCheckpoints/items/required: `required` is required to be supplied and to be an array including every key in properties. The following properties must be listed in `required`: funnyDistractor"
        ),
        { statusCode: 400 }
      );
      expect(isRetryableAiError(err)).toBe(true);
    });

    it("a 400 with no schema-incompatibility wording is still fatal, unchanged", () => {
      expect(isRetryableAiError(Object.assign(new Error("Invalid request: message is required"), { statusCode: 400 }))).toBe(false);
    });
  });

  describe("generated content violating its own schema's constraints — also worth another model", () => {
    // Live-caught 2026-09-25 auditing lib/ai/agents/taskAgent.ts: Groq
    // accepted the schema fine, but the model's own reply overshot
    // considerations' max(6) with 11 entries, and Groq 400s that server-side
    // rather than just returning the (invalid) JSON. One model's sampling
    // overshooting a constraint says nothing about the next model in the
    // chain, so this is worth a fallover exactly like a real schema
    // incompatibility, not a fatal stop.
    it("retries Groq's maxItems content-validation rejection despite the 400", () => {
      const err = Object.assign(
        new Error(
          "Generated JSON does not match the expected schema. Please adjust your prompt. See 'failed_generation' for more details. Error: jsonschema: '/considerations' does not validate with /properties/considerations/anyOf/0/maxItems: maxItems: got 11, want 6"
        ),
        { statusCode: 400 }
      );
      expect(isRetryableAiError(err)).toBe(true);
    });
  });

  describe("capacity failures — worth another model", () => {
    it("retries the exact error the app is failing with in production", () => {
      // AI_APICallError: This model is currently experiencing high demand
      const err = Object.assign(new Error("This model is currently experiencing high demand"), {
        name: "AI_APICallError",
      });
      expect(isRetryableAiError(err)).toBe(true);
    });

    it("retries 429 and 503", () => {
      expect(isRetryableAiError({ statusCode: 429, message: "" })).toBe(true);
      expect(isRetryableAiError({ statusCode: 503, message: "" })).toBe(true);
    });

    it("retries 500/502/504", () => {
      for (const statusCode of [500, 502, 504]) {
        expect(isRetryableAiError({ statusCode, message: "" })).toBe(true);
      }
    });

    // Live-confirmed 2026-09-25 against real Cerebras/SambaNova accounts:
    // "Payment Required" is account-specific, not a sign every model in the
    // chain will fail the same way — a different provider is worth trying.
    it("retries 402 (a provider account with no billing configured)", () => {
      expect(isRetryableAiError({ statusCode: 402, message: "Payment Required" })).toBe(true);
    });

    it("reads a status nested on a response object", () => {
      expect(isRetryableAiError({ response: { status: 503 }, message: "" })).toBe(true);
    });

    it("reads `status` as well as `statusCode`", () => {
      expect(isRetryableAiError({ status: 429, message: "" })).toBe(true);
    });

    it("retries an abort from AbortSignal.timeout", () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      expect(isRetryableAiError(err)).toBe(true);
    });

    it("retries transient network failures", () => {
      for (const message of ["fetch failed", "socket hang up", "ECONNRESET", "ETIMEDOUT"]) {
        expect(isRetryableAiError(new Error(message))).toBe(true);
      }
    });

    it("retries overload wording regardless of case", () => {
      expect(isRetryableAiError(new Error("Model OVERLOADED, please Try Again"))).toBe(true);
    });

    // Both providers actually surface quota exhaustion as HTTP 429, already
    // covered above — these three assert the explicit text fallback still
    // catches it if a wrapper ever loses the numeric status.
    it("retries OpenAI's insufficient_quota wording with no status attached", () => {
      const err = new Error("You exceeded your current quota, please check your plan and billing details.");
      expect(isRetryableAiError(err)).toBe(true);
      expect(isRetryableAiError(new Error("insufficient_quota"))).toBe(true);
    });

    it("retries Gemini's RESOURCE_EXHAUSTED wording with no status attached", () => {
      expect(isRetryableAiError(new Error("RESOURCE_EXHAUSTED: quota exceeded for this project"))).toBe(true);
    });
  });

  describe("correctness failures — the same on every model", () => {
    it("never retries a bad API key", () => {
      expect(isRetryableAiError({ statusCode: 401, message: "Invalid API key" })).toBe(false);
    });

    it("never retries 403 or 404", () => {
      expect(isRetryableAiError({ statusCode: 403, message: "" })).toBe(false);
      expect(isRetryableAiError({ statusCode: 404, message: "model not found" })).toBe(false);
    });

    it("never retries a malformed request", () => {
      expect(isRetryableAiError({ statusCode: 400, message: "bad request" })).toBe(false);
    });

    // The specific trap: a fatal status whose text happens to look retryable.
    // Status must win, or one clear auth error becomes a slow walk through
    // every model in the chain ending in the same error.
    it("lets a fatal status override retryable-looking text", () => {
      expect(isRetryableAiError({ statusCode: 401, message: "high demand, please try again" })).toBe(false);
    });

    it("does not retry an ordinary error with no capacity signal", () => {
      expect(isRetryableAiError(new Error("Something specific went wrong"))).toBe(false);
    });
  });

  describe("odd input", () => {
    it("handles null and undefined without throwing", () => {
      expect(isRetryableAiError(null)).toBe(false);
      expect(isRetryableAiError(undefined)).toBe(false);
    });

    it("handles a bare string", () => {
      expect(isRetryableAiError("service unavailable")).toBe(true);
      expect(isRetryableAiError("nope")).toBe(false);
    });

    it("handles an object with no message or status", () => {
      expect(isRetryableAiError({})).toBe(false);
    });
  });
});
