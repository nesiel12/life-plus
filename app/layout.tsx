import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { MotionConfig } from "framer-motion";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/providers/AuthProvider";
import {
  ThemeProvider,
  themeInitScript,
} from "@/components/providers/ThemeProvider";
import { ActiveSkinProvider } from "@/components/providers/ActiveSkinProvider";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SerwistProvider } from "@serwist/turbopack/react";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["latin", "hebrew"],
});

export const metadata: Metadata = {
  title: "Life Plus",
  // Google Search Console — HTML-tag verification. Renders
  // <meta name="google-site-verification" content="..."> into <head> on every
  // page, including the public /login page an auth redirect lands on, so the
  // verifier sees it without a session. This is the token from Search
  // Console's "HTML tag" method (distinct from the public/ file method's
  // token); both methods stay in place, since removing a verified one can
  // un-verify the property.
  // iOS ignores the web manifest for home-screen installs; these are what
  // make "הוסף למסך הבית" open standalone with the right title.
  appleWebApp: {
    capable: true,
    title: "Life Plus",
    statusBarStyle: "default",
  },
  verification: {
    google: "hu1yXiRy9cLRr1E5zCh83reeAov7fV3FLBnU7mCStGY",
  },
};

// Tints the browser chrome / iOS status bar to match the app rather than
// showing the OS default. Tracks the two base theme tokens (globals.css);
// the further skins under ActiveSkinProvider don't get their own entry here
// since this only has light/dark to key off, not skin identity.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // overflow-x-clip, not -hidden, on html/body and the shell: `hidden`
    // turns an element into a scroll container, and with it on body the
    // desktop Sidebar's `position: sticky` would stick to body (which never
    // scrolls) instead of the viewport. `clip` cuts horizontal overflow
    // without creating one.
    <html lang="he" dir="rtl" className="max-w-full overflow-x-clip" suppressHydrationWarning>
      <head>
        {/* Sets <html data-theme> before first paint — no flash of wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${heebo.variable} antialiased max-w-full overflow-x-clip`}>
        {/* Offline shell: registers /serwist/sw.js (production only — a dev
            service worker would serve stale Turbopack chunks). reloadOnOnline
            is off so regaining signal never throws away a lesson mid-read. */}
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={process.env.NODE_ENV === "development"}
          register
          reloadOnOnline={false}
        >
          {/* Respects the OS-level "reduce motion" setting for every
              framer-motion animation in the app with one change, instead of
              each component re-implementing its own check (design/motion/a11y
              audit). "user" means it only ever reduces motion when the person
              has actually asked for that — never forced. */}
          <MotionConfig reducedMotion="user">
            <ThemeProvider>
              <PreferencesProvider>
                <AuthProvider>
                  <QueryProvider>
                    <ActiveSkinProvider>
                      <AppShell>{children}</AppShell>
                    </ActiveSkinProvider>
                  </QueryProvider>
                </AuthProvider>
              </PreferencesProvider>
            </ThemeProvider>
          </MotionConfig>
        </SerwistProvider>
      </body>
    </html>
  );
}
