import "server-only";

/**
 * The deployment's own public origin, with no trailing slash.
 *
 * Google OAuth redirect URIs are built from this and must match a URI
 * registered in the Cloud console byte for byte, so getting it wrong does not
 * degrade — it breaks the flow outright.
 *
 * The two call sites previously each carried their own
 * `process.env.NEXTAUTH_URL ?? "http://localhost:3000"`. That fallback is
 * correct in development and actively harmful in production: a deploy missing
 * NEXTAUTH_URL would not fail, it would hand Google a localhost redirect URI
 * and send users to their own machine after consenting. The user sees a dead
 * page and reasonably concludes the app is broken rather than unconfigured.
 *
 * So production has no fallback. Throwing surfaces the misconfiguration in
 * the logs with the fix in the message, and it is confined to the Photos
 * feature — the rest of the app is unaffected.
 */
export function appBaseUrl(): string {
  const configured = process.env.NEXTAUTH_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXTAUTH_URL is not set. Set it to this deployment's public origin " +
        "(for example https://your-app.vercel.app) — the Google OAuth redirect " +
        "URIs are derived from it and must match what is registered in the " +
        "Google Cloud console."
    );
  }

  return "http://localhost:3000";
}
