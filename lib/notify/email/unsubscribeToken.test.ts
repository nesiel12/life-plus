import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/notify/email/unsubscribeToken";

const ORIGINAL_SECRET = process.env.NEXTAUTH_SECRET;

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-value-for-signing";
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = ORIGINAL_SECRET;
});

describe("unsubscribe tokens", () => {
  it("round-trips a user id", () => {
    const token = signUnsubscribeToken("user-123");
    expect(verifyUnsubscribeToken(token)?.uid).toBe("user-123");
  });

  it("round-trips an optional kind", () => {
    const token = signUnsubscribeToken("user-123", "daily_insight");
    const payload = verifyUnsubscribeToken(token);
    expect(payload?.uid).toBe("user-123");
    expect(payload?.kind).toBe("daily_insight");
  });

  it("omits kind entirely when not given, rather than storing undefined", () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken("user-123"))?.kind).toBeUndefined();
  });

  it("rejects a tampered payload", () => {
    const token = signUnsubscribeToken("user-123");
    const [, signature] = token.split(".");
    // Re-point the token at a different user, keeping the original signature.
    const forgedPayload = Buffer.from(JSON.stringify({ uid: "victim", iat: 1 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyUnsubscribeToken(`${forgedPayload}.${signature}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const [payload] = signUnsubscribeToken("user-123").split(".");
    expect(verifyUnsubscribeToken(`${payload}.notasignature`)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("nodot")).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c")).toBeNull();
    expect(verifyUnsubscribeToken(".")).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken("user-123");
    process.env.NEXTAUTH_SECRET = "a-completely-different-secret";
    // Rotating the secret must invalidate outstanding links, not silently
    // keep honouring them.
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("rejects a payload whose uid is missing or not a string", () => {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    // Signed correctly, but structurally wrong — the shape check has to run
    // after signature verification, not instead of it.
    for (const bad of [{ iat: 1 }, { uid: 42, iat: 1 }, { uid: "", iat: 1 }]) {
      const payload = encode(bad);
      const token = signUnsubscribeToken("seed");
      const [, sig] = token.split(".");
      // Not a valid signature for this payload, so this also confirms the
      // verifier does not fall through to accepting it.
      expect(verifyUnsubscribeToken(`${payload}.${sig}`)).toBeNull();
    }
  });

  it("throws when signing without a secret, rather than issuing an unsigned link", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => signUnsubscribeToken("user-123")).toThrow(/NEXTAUTH_SECRET/);
  });

  it("returns null rather than throwing when verifying without a secret", () => {
    const token = signUnsubscribeToken("user-123");
    delete process.env.NEXTAUTH_SECRET;
    // The route must render "invalid link", not a 500.
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });
});
