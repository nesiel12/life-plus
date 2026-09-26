import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const storeClear = vi.fn(async () => {});
vi.mock("localforage", () => ({
  default: { createInstance: () => ({ clear: storeClear, getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }) },
}));

const { claimOfflineData, clearOfflineData } = await import("./offlineStore");

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(["ai-content", "step-brief", "s1"], { summary: "private" });
  return client;
}

describe("offline data ownership", () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    });
    const cacheDelete = vi.fn(async () => true);
    vi.stubGlobal("caches", { keys: async () => ["serwist-precache-v2-http://x/", "pages", "pages-rsc"], delete: cacheDelete });
    storeClear.mockClear();
  });

  it("keeps the restored snapshot for the same person", async () => {
    const client = seeded();
    await claimOfflineData(client, "a@example.com");
    await claimOfflineData(client, "A@example.com ");
    expect(client.getQueryData(["ai-content", "step-brief", "s1"])).toEqual({ summary: "private" });
    expect(storeClear).not.toHaveBeenCalled();
  });

  it("wipes a snapshot that belongs to someone else", async () => {
    const client = seeded();
    await claimOfflineData(client, "a@example.com");
    await claimOfflineData(client, "b@example.com");
    expect(client.getQueryData(["ai-content", "step-brief", "s1"])).toBeUndefined();
    expect(storeClear).toHaveBeenCalledOnce();
  });

  it("wipes everything when nobody is signed in", async () => {
    const client = seeded();
    await claimOfflineData(client, null);
    expect(client.getQueryData(["ai-content", "step-brief", "s1"])).toBeUndefined();
    expect(storeClear).toHaveBeenCalledOnce();
  });

  it("sign-out clears memory, IndexedDB and the personal page caches — but keeps the static precache", async () => {
    const client = seeded();
    await clearOfflineData(client);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(storeClear).toHaveBeenCalledOnce();
    const del = (globalThis.caches as unknown as { delete: ReturnType<typeof vi.fn> }).delete;
    expect(del.mock.calls.map((c) => c[0])).toEqual(["pages", "pages-rsc"]);
  });

  it("does not store the email itself", async () => {
    await claimOfflineData(new QueryClient(), "a@example.com");
    expect(localStorage.getItem("lifeplus.offlineOwner")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isConfirmedSignedOut", () => {
  it("is false when the session endpoint is unreachable — offline is not a sign-out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { isConfirmedSignedOut } = await import("./offlineStore");
    expect(await isConfirmedSignedOut()).toBe(false);
  });

  it("is false on a server error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const { isConfirmedSignedOut } = await import("./offlineStore");
    expect(await isConfirmedSignedOut()).toBe(false);
  });

  it("is true only when the server answers with no user", async () => {
    const { isConfirmedSignedOut } = await import("./offlineStore");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await isConfirmedSignedOut()).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: { email: "a@b.c" } }), { status: 200 })));
    expect(await isConfirmedSignedOut()).toBe(false);
  });
});
