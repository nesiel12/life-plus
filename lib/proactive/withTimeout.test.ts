import { describe, it, expect } from "vitest";
import { withTimeout, TimeoutError } from "@/lib/proactive/withTimeout";

describe("withTimeout", () => {
  it("resolves with the value when the promise wins the race", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("rejects with TimeoutError when the promise is too slow", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 50));
    await expect(withTimeout(slow, 10, "slow op")).rejects.toBeInstanceOf(TimeoutError);
  });

  it("propagates the original rejection when the promise fails fast", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });
});
