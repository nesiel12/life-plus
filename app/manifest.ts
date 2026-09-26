import type { MetadataRoute } from "next";

// Chrome only offers installation (beforeinstallprompt) with a 192 and a 512
// icon; the 128/180 file-convention icons alone never qualified.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Life Plus",
    short_name: "Life Plus",
    description: "מערכת הפעלה אישית — למידה, יומן, בריאות ומשפחה במקום אחד.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#f8f7f4",
    theme_color: "#f8f7f4",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
