// Paths that must always be served as-is: no auth gate, no host rewrite, no
// redirect of any kind. Domain-ownership and search-engine files
// (google<token>.html, BingSiteAuth.xml, /.well-known/*) are fetched directly
// by an external verifier that treats any 3xx or non-200 as failure.
//
// Pure and separate from middleware.ts so it can be tested without the edge
// runtime and the next-auth import graph.

const PUBLIC_FILE =
  /^\/(?:google[0-9a-z]+\.html|BingSiteAuth\.xml|robots\.txt|sitemap\.xml|favicon\.ico|apple-icon\.png|icon\.png|manifest\.webmanifest|sw\.js)$/i;

export function isAlwaysPublicPath(pathname: string): boolean {
  return PUBLIC_FILE.test(pathname) || pathname.startsWith("/.well-known/");
}
