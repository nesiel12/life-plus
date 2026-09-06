import { afterEach, describe, expect, it, vi } from "vitest";

// This is the whole bug in one assertion: the cookie's name and its Secure
// flag must always agree with each other, driven by one signal. Getting
// them from two different sources (NEXTAUTH_URL for one, request detection
// for the other) is exactly how a session cookie gets written under one
// name and searched for under another — see the module for the mechanism.
//
// NODE_ENV is read at module load, so each case re-imports fresh with
// vi.resetModules() rather than mutating the already-loaded export.
async function loadWith(nodeEnv: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv as string);
  const { sessionCookieConfig } = await import("@/lib/sessionCookie");
  return sessionCookieConfig;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("sessionCookieConfig", () => {
  it("uses the __Secure- prefix and secure:true in production", async () => {
    const config = await loadWith("production");
    expect(config.sessionToken.name).toBe("__Secure-next-auth.session-token");
    expect(config.sessionToken.options.secure).toBe(true);
  });

  it("uses the plain name and secure:false outside production", async () => {
    const config = await loadWith("development");
    expect(config.sessionToken.name).toBe("next-auth.session-token");
    expect(config.sessionToken.options.secure).toBe(false);
  });

  it("is never split — the prefix and the Secure flag always move together", async () => {
    for (const env of ["production", "development", "test"]) {
      const config = await loadWith(env);
      const hasPrefix = config.sessionToken.name.startsWith("__Secure-");
      expect(hasPrefix).toBe(config.sessionToken.options.secure);
    }
  });

  it("does not depend on NEXTAUTH_URL at all", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    // The exact value that caused the real incident: NEXTAUTH_URL set to a
    // stray localhost URL in the Production environment. If this module
    // read that variable the way next-auth/jwt's getToken does, this would
    // flip the result back to the broken, unprefixed name.
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    const { sessionCookieConfig } = await import("@/lib/sessionCookie");
    expect(sessionCookieConfig.sessionToken.name).toBe("__Secure-next-auth.session-token");
    expect(sessionCookieConfig.sessionToken.options.secure).toBe(true);
  });

  it("sets the other cookie attributes NextAuth's own default uses", async () => {
    const config = await loadWith("production");
    expect(config.sessionToken.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });
});
