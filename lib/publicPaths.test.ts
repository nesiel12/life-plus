import { describe, expect, it } from "vitest";
import { isAlwaysPublicPath } from "@/lib/publicPaths";

describe("isAlwaysPublicPath", () => {
  it("matches a Google Search Console verification file", () => {
    expect(isAlwaysPublicPath("/google1c8382cd2dfa822b.html")).toBe(true);
  });

  it("matches other well-known verification and crawler files", () => {
    for (const p of [
      "/BingSiteAuth.xml",
      "/robots.txt",
      "/sitemap.xml",
      "/favicon.ico",
      "/manifest.webmanifest",
      "/sw.js",
      "/.well-known/apple-app-site-association",
      "/.well-known/security.txt",
    ]) {
      expect(isAlwaysPublicPath(p), p).toBe(true);
    }
  });

  it("does not match app routes, even lookalikes", () => {
    for (const p of [
      "/",
      "/login",
      "/calendar",
      "/areas/time",
      "/settings",
      "/google-stuff", // no .html
      "/foo/google1c8382cd2dfa822b.html", // not at root
      "/googlebar.html/extra",
    ]) {
      expect(isAlwaysPublicPath(p), p).toBe(false);
    }
  });
});
