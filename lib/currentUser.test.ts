import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the 2026-09-25 incident: getCurrentUser() used to
// throw "User record not found for authenticated session" the moment a
// valid NextAuth session pointed at a users row that didn't (or no longer)
// exist — an unhandled crash on the very first Server Action any page
// happened to call. It now self-heals by re-running the same provisioning
// lib/auth.ts's own signIn event does.

const getServerSession = vi.fn();
vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const getUserByEmail = vi.fn();
const getOrCreateUserByEmail = vi.fn();
vi.mock("@/lib/db/users", () => ({
  getUserByEmail: (...args: unknown[]) => getUserByEmail(...args),
  getOrCreateUserByEmail: (...args: unknown[]) => getOrCreateUserByEmail(...args),
}));

const ensureDefaultsForUser = vi.fn();
vi.mock("@/lib/db/lifeAreaScores", () => ({
  lifeAreaScoresRepo: { ensureDefaultsForUser: (...args: unknown[]) => ensureDefaultsForUser(...args) },
}));

const personalDnaUpsert = vi.fn();
vi.mock("@/lib/db/personalDna", () => ({
  personalDnaRepo: { upsert: (...args: unknown[]) => personalDnaUpsert(...args) },
}));

const notificationPreferencesUpsert = vi.fn();
vi.mock("@/lib/db/notificationPreferences", () => ({
  notificationPreferencesRepo: { upsert: (...args: unknown[]) => notificationPreferencesUpsert(...args) },
}));

const { getCurrentUser, getCurrentUserId } = await import("@/lib/currentUser");

const SESSION = { user: { email: "nesiel@example.com", name: "Nesiel", image: null } };
const ROW = { id: "u1", email: "nesiel@example.com", name: "Nesiel" };

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("getCurrentUser", () => {
  it("throws when there is no session at all", async () => {
    getServerSession.mockResolvedValue(null);
    await expect(getCurrentUser()).rejects.toThrow("Not authenticated");
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("returns the existing row directly when one is found — no provisioning attempted", async () => {
    getServerSession.mockResolvedValue(SESSION);
    getUserByEmail.mockResolvedValue(ROW);

    await expect(getCurrentUser()).resolves.toEqual(ROW);
    expect(getOrCreateUserByEmail).not.toHaveBeenCalled();
  });

  it("self-heals instead of throwing when the session's row is missing", async () => {
    getServerSession.mockResolvedValue(SESSION);
    getUserByEmail.mockResolvedValue(null);
    getOrCreateUserByEmail.mockResolvedValue(ROW);
    ensureDefaultsForUser.mockResolvedValue(undefined);
    personalDnaUpsert.mockResolvedValue({});
    notificationPreferencesUpsert.mockResolvedValue({});

    const user = await getCurrentUser();

    expect(user).toEqual(ROW);
    expect(getOrCreateUserByEmail).toHaveBeenCalledWith("nesiel@example.com", { name: "Nesiel", image: null });
    // The same three dependent rows lib/auth.ts's own signIn event creates —
    // a self-healed account must not be left thinner than a normal one.
    expect(ensureDefaultsForUser).toHaveBeenCalledWith("u1");
    expect(personalDnaUpsert).toHaveBeenCalledWith("u1", {});
    expect(notificationPreferencesUpsert).toHaveBeenCalledWith("u1", {});
  });

  it("logs the self-heal — anomalous, even though handled", async () => {
    getServerSession.mockResolvedValue(SESSION);
    getUserByEmail.mockResolvedValue(null);
    getOrCreateUserByEmail.mockResolvedValue(ROW);
    ensureDefaultsForUser.mockResolvedValue(undefined);
    personalDnaUpsert.mockResolvedValue({});
    notificationPreferencesUpsert.mockResolvedValue({});

    await getCurrentUser();

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("nesiel@example.com"));
  });

  it("falls back to the session email when the Google profile has no name", async () => {
    getServerSession.mockResolvedValue({ user: { email: "nesiel@example.com", name: null, image: null } });
    getUserByEmail.mockResolvedValue(null);
    getOrCreateUserByEmail.mockResolvedValue(ROW);
    ensureDefaultsForUser.mockResolvedValue(undefined);
    personalDnaUpsert.mockResolvedValue({});
    notificationPreferencesUpsert.mockResolvedValue({});

    await getCurrentUser();

    expect(getOrCreateUserByEmail).toHaveBeenCalledWith("nesiel@example.com", { name: "nesiel@example.com", image: null });
  });
});

describe("getCurrentUserId", () => {
  it("resolves to the row's id", async () => {
    getServerSession.mockResolvedValue(SESSION);
    getUserByEmail.mockResolvedValue(ROW);
    await expect(getCurrentUserId()).resolves.toBe("u1");
  });
});
