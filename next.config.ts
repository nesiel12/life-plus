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
  env: {
    NEXT_PUBLIC_LOGO_MARK: `/${logoMark}`,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
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
