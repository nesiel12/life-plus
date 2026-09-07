import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueUnlockToken, verifyUnlockToken } from "@/lib/recovery/unlockToken";

const ORIGINAL = process.env.NEXTAUTH_SECRET;
const TTL = 600;

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-unlock-tokens";
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = ORIGINAL;
});

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("unlock tokens", () => {
  it("verifies a freshly issued token for its own user", () => {
    expect(verifyUnlockToken(issueUnlockToken("user-1", TTL), "user-1")).toBe(true);
  });

  it("refuses a token issued for a different user", () => {
    // The whole point of binding uid: one account's unlock must never open
    // another account's recovery space.
    expect(verifyUnlockToken(issueUnlockToken("user-1", TTL), "user-2")).toBe(false);
  });

  it("expires", () => {
    vi.useFakeTimers();
    const token = issueUnlockToken("user-1", 60);
    expect(verifyUnlockToken(token, "user-1")).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(verifyUnlockToken(token, "user-1")).toBe(false);
  });

  it("refuses a token whose payload was swapped for another user's", () => {
    const [, signature] = issueUnlockToken("user-1", TTL).split(".");
    const forged = encode({ uid: "user-2", exp: Math.floor(Date.now() / 1000) + TTL });
    expect(verifyUnlockToken(`${forged}.${signature}`, "user-2")).toBe(false);
  });

  it("refuses a token whose expiry was extended", () => {
    const [payload, signature] = issueUnlockToken("user-1", TTL).split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const extended = encode({ ...decoded, exp: decoded.exp + 86_400 });
    expect(verifyUnlockToken(`${extended}.${signature}`, "user-1")).toBe(false);
  });

  it("refuses a tampered signature", () => {
    const [payload] = issueUnlockToken("user-1", TTL).split(".");
    expect(verifyUnlockToken(`${payload}.notarealsignature`, "user-1")).toBe(false);
  });

  it("refuses malformed input rather than throwing", () => {
    for (const bad of ["", ".", "nodot", "a.b.c", "..", "x."]) {
      expect(verifyUnlockToken(bad, "user-1")).toBe(false);
    }
  });

  it("refuses a payload that is not valid JSON", () => {
    const payload = Buffer.from("not json").toString("base64url");
    expect(verifyUnlockToken(`${payload}.whatever`, "user-1")).toBe(false);
  });

  it("refuses a payload missing uid or exp", () => {
    for (const bad of [{ exp: Math.floor(Date.now() / 1000) + TTL }, { uid: "user-1" }, {}]) {
      const payload = encode(bad);
      expect(verifyUnlockToken(`${payload}.sig`, "user-1")).toBe(false);
    }
  });

  it("stops honouring outstanding tokens once the secret rotates", () => {
    const token = issueUnlockToken("user-1", TTL);
    process.env.NEXTAUTH_SECRET = "a-different-secret";
    expect(verifyUnlockToken(token, "user-1")).toBe(false);
  });

  it("throws when signing without a secret, rather than issuing an unsigned token", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => issueUnlockToken("user-1", TTL)).toThrow(/NEXTAUTH_SECRET/);
  });

  it("reports locked, not an error, when verifying without a secret", () => {
    const token = issueUnlockToken("user-1", TTL);
    delete process.env.NEXTAUTH_SECRET;
    // A misconfigured deploy must fail closed — locked — not 500.
    expect(verifyUnlockToken(token, "user-1")).toBe(false);
  });
});
