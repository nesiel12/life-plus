import { describe, expect, it } from "vitest";
import { authOptions } from "@/lib/auth";
import type { User } from "next-auth";

// Sign-in policy.
//
// This tests the real callback on the real authOptions object rather than a
// re-implementation of the rule, because the thing worth guarding is exactly
// what NextAuth will call. A parallel copy of the predicate could pass
// happily while the shipped callback did something else.
//
// The policy changed from a fail-closed ALLOWED_SIGNIN_EMAILS allow-list to
// open sign-up. These tests exist mainly so a re-introduced allow-list is a
// failing test rather than a silent lockout — the previous behaviour's
// failure mode was that an unset variable locked out every user including
// the owner, with nothing in the logs saying why.

const signIn = authOptions.callbacks?.signIn;

/** The callback only reads `user`; the rest of the argument is irrelevant. */
function attempt(user: Partial<User>) {
  if (!signIn) throw new Error("authOptions.callbacks.signIn is not defined");
  return signIn({
    user: user as User,
    account: null,
  } as Parameters<NonNullable<typeof signIn>>[0]);
}

describe("signIn callback", () => {
  it("is wired up", () => {
    expect(signIn).toBeTypeOf("function");
  });

  describe("open sign-up", () => {
    it("admits any Google account", async () => {
      await expect(attempt({ email: "anyone@gmail.com" })).resolves.toBe(true);
    });

    it("admits an address on a domain nobody configured", async () => {
      await expect(attempt({ email: "stranger@some-company.co.il" })).resolves.toBe(true);
    });

    it("admits regardless of case", async () => {
      await expect(attempt({ email: "MiXeD@Example.COM" })).resolves.toBe(true);
    });

    // The old allow-list was keyed off an environment variable. Nothing about
    // the decision may depend on one any more, in either direction.
    it("is unaffected by an ALLOWED_SIGNIN_EMAILS value being present", async () => {
      const previous = process.env.ALLOWED_SIGNIN_EMAILS;
      process.env.ALLOWED_SIGNIN_EMAILS = "only-this-one@example.com";
      try {
        await expect(attempt({ email: "someone-else@example.com" })).resolves.toBe(true);
      } finally {
        if (previous === undefined) delete process.env.ALLOWED_SIGNIN_EMAILS;
        else process.env.ALLOWED_SIGNIN_EMAILS = previous;
      }
    });

    it("is unaffected by the variable being empty", async () => {
      const previous = process.env.ALLOWED_SIGNIN_EMAILS;
      process.env.ALLOWED_SIGNIN_EMAILS = "";
      try {
        await expect(attempt({ email: "anyone@gmail.com" })).resolves.toBe(true);
      } finally {
        if (previous === undefined) delete process.env.ALLOWED_SIGNIN_EMAILS;
        else process.env.ALLOWED_SIGNIN_EMAILS = previous;
      }
    });
  });

  describe("an email is still required", () => {
    // Not a leftover of the allow-list. The email is the tenancy key:
    // getCurrentUser() resolves the users row from session.user.email, so a
    // session without one cannot be scoped to any data and would throw on
    // the first Server Action. Refusing here makes that a clean failure.
    it("rejects a user with no email", async () => {
      await expect(attempt({ email: null })).resolves.toBe(false);
    });

    it("rejects a user whose email is undefined", async () => {
      await expect(attempt({})).resolves.toBe(false);
    });

    it("rejects an empty-string email", async () => {
      await expect(attempt({ email: "" })).resolves.toBe(false);
    });
  });
});

describe("auth configuration is otherwise unchanged", () => {
  it("still routes sign-in through the custom login page", () => {
    expect(authOptions.pages?.signIn).toBe("/login");
  });

  it("still configures exactly one provider, Google", () => {
    expect(authOptions.providers).toHaveLength(1);
    expect(authOptions.providers[0].id).toBe("google");
  });

  // Removing the allow-list must not have touched session integrity.
  it("still reads its secret from NEXTAUTH_SECRET", () => {
    expect(authOptions.secret).toBe(process.env.NEXTAUTH_SECRET);
  });

  it("still provisions the user row on the signIn event", () => {
    expect(authOptions.events?.signIn).toBeTypeOf("function");
  });

  it("still refreshes Google tokens through the jwt callback", () => {
    expect(authOptions.callbacks?.jwt).toBeTypeOf("function");
  });

  it("still requests the calendar.events scope and offline access", () => {
    // Read from `options`, not the top-level `authorization`: GoogleProvider
    // leaves its own default ("openid email profile") on the latter and keeps
    // what the caller passed under `options`, merging the two only when
    // NextAuth initialises. Asserting on the top level would have quietly
    // passed against the default and told us nothing about our own config.
    const google = authOptions.providers[0] as unknown as {
      options?: { authorization?: { params?: { scope?: string; access_type?: string } } };
    };
    const params = google.options?.authorization?.params;
    expect(params?.scope).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(params?.access_type).toBe("offline");
  });
});
