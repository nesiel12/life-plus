import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

// Serves the service worker at /serwist/sw.js. Turbopack has no plugin hook
// for Serwist, so the worker is bundled here with esbuild at build time and
// served as a static route.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  // Next's default browserslist (chrome64/safari12) makes esbuild reject
  // serwist's own syntax; module service workers need far newer browsers
  // than that anyway.
  esbuildOptions: { target: "es2020" },
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
});
