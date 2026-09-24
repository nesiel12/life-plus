import { afterEach, describe, expect, it, vi } from "vitest";

// currentUserActor's one real decision: does the session's email match
// AI_QUOTA_UNLIMITED_EMAILS? getCurrentUser is mocked rather than the
// session/DB layer underneath it — that boundary is already covered by
// lib/currentUser's own tests; this is only about what actor.ts does with
// what it returns.

const getCurrentUser = vi.fn();
vi.mock("@/lib/currentUser", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

const { currentUserActor } = await import("@/lib/ai/actor");

const SAVED = process.env.AI_QUOTA_UNLIMITED_EMAILS;
afterEach(() => {
  if (SAVED === undefined) delete process.env.AI_QUOTA_UNLIMITED_EMAILS;
  else process.env.AI_QUOTA_UNLIMITED_EMAILS = SAVED;
  getCurrentUser.mockReset();
});

describe("currentUserActor", () => {
  it("resolves a plain user actor when the email is not exempt", async () => {
    delete process.env.AI_QUOTA_UNLIMITED_EMAILS;
    getCurrentUser.mockResolvedValue({ id: "u1", email: "stranger@example.com" });

    await expect(currentUserActor()).resolves.toEqual({ kind: "user", userId: "u1" });
  });

  it("resolves an exempt actor when the session email matches AI_QUOTA_UNLIMITED_EMAILS", async () => {
    process.env.AI_QUOTA_UNLIMITED_EMAILS = "owner@example.com";
    getCurrentUser.mockResolvedValue({ id: "u2", email: "owner@example.com" });

    await expect(currentUserActor()).resolves.toEqual({ kind: "exempt", userId: "u2", email: "owner@example.com" });
  });

  it("matches case-insensitively", async () => {
    process.env.AI_QUOTA_UNLIMITED_EMAILS = "owner@example.com";
    getCurrentUser.mockResolvedValue({ id: "u3", email: "Owner@Example.com" });

    await expect(currentUserActor()).resolves.toMatchObject({ kind: "exempt" });
  });

  it("never exempts an unlisted email even when the list is non-empty", async () => {
    process.env.AI_QUOTA_UNLIMITED_EMAILS = "owner@example.com";
    getCurrentUser.mockResolvedValue({ id: "u4", email: "someone-else@example.com" });

    await expect(currentUserActor()).resolves.toEqual({ kind: "user", userId: "u4" });
  });
});
