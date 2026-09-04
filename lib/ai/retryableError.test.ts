import { describe, expect, it } from "vitest";
import { isRetryableAiError } from "@/lib/ai/retryableError";

describe("isRetryableAiError", () => {
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
