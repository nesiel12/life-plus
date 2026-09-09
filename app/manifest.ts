import type { MetadataRoute } from "next";

// PWA manifest — served at /manifest.webmanifest (already whitelisted in
// lib/publicPaths.ts). Makes the app installable on a phone, which is the
// precondition for Web Push notifications reaching the OS notification tray.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life Plus",
    short_name: "Life Plus",
    description: "היומן, הבריאות, המשפחה והמרחב האישי שלך — במקום אחד, שלומד אותך.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "he",
    dir: "rtl",
    background_color: "#100f13",
    theme_color: "#100f13",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
