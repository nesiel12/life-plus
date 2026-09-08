import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { MotionConfig } from "framer-motion";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ThemeProvider, themeInitScript } from "@/components/providers/ThemeProvider";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["latin", "hebrew"],
});

export const metadata: Metadata = {
  title: "Life Plus",
  // Google Search Console — HTML-tag verification. Renders
  // <meta name="google-site-verification" content="..."> into <head> on every
  // page, including the public /login page an auth redirect lands on, so the
  // verifier sees it without a session. Kept alongside the
  // public/google1c8382cd2dfa822b.html file method; Search Console allows more
  // than one and dropping a verified method later can un-verify the property.
  verification: {
    google: "google1c8382cd2dfa822b",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Sets <html data-theme> before first paint — no flash of wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${heebo.variable} antialiased`}>
        {/* Respects the OS-level "reduce motion" setting for every
            framer-motion animation in the app with one change, instead of
            each component re-implementing its own check (design/motion/a11y
            audit). "user" means it only ever reduces motion when the person
            has actually asked for that — never forced. */}
        <MotionConfig reducedMotion="user">
          <ThemeProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </ThemeProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
