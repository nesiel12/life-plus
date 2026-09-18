import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Which brand-mark file actually exists in public/, resolved once at build
// time so the client never requests a missing file and flashes a broken-image
// glyph. Drop the real artwork in as public/life-plus-mark.png (or .webp /
// .jpg) and restart the dev server — it takes precedence over the gold SVG
// placeholder with no code change.
const MARK_CANDIDATES = [
  "life-plus-mark.png",
  "life-plus-mark.webp",
  "life-plus-mark.jpg",
  "life-plus-mark.svg",
];

const logoMark =
  MARK_CANDIDATES.find((file) => existsSync(path.join(process.cwd(), "public", file))) ??
  "life-plus-mark.svg";

const nextConfig: NextConfig = {
  // Overridable so a second dev server can run from this folder at the same
  // time (see "life-plus-dev-alt" in .claude/launch.json). Two `next dev`
  // processes writing one .next directory corrupt each other's manifests and
  // both start answering 500.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_LOGO_MARK: `/${logoMark}`,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      // Book cover art for the ספרים hub. Both hosts are Google Books' own
      // thumbnail CDNs. These URLs are only ever written server-side from the
      // Google Books API response (app/actions/books.ts), never from client
      // input, so this does not widen what a user can point an <img> at.
      {
        protocol: "https",
        hostname: "books.google.com",
      },
      {
        protocol: "https",
        hostname: "books.googleusercontent.com",
      },
    ],
  },
  // The Time & Tasks space was folded into the Smart Calendar. Old links and
  // bookmarks land on the unified /calendar view.
  async redirects() {
    return [{ source: "/areas/time", destination: "/calendar", permanent: true }];
  },
};

export default nextConfig;
