// Google Search Console site-verification, served as a Route Handler.
//
// The same token also lives at public/google1c8382cd2dfa822b.html. On a
// normal deployment the static file is served by the CDN and this never runs.
// It exists because Search Console fetches the URL directly and fails
// verification on anything that is not a 2xx with the token in the body — and
// a Route Handler is the one thing in the App Router that cannot be wrapped
// by app/layout.tsx, cannot mount <AppShell>, and does no data fetching. If
// static serving is ever bypassed (a stale deployment, a platform rewrite),
// this guarantees the path still answers with exactly the token.
//
// force-static + no revalidation: the body never changes, so it is baked at
// build time and served from the edge cache like the static file it mirrors.

export const dynamic = "force-static";

const TOKEN = "google-site-verification: google1c8382cd2dfa822b.html";

export function GET(): Response {
  return new Response(TOKEN, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
