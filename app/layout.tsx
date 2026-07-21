import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { MotionConfig } from "framer-motion";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { APP_TAGLINE } from "@/lib/constants";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["latin", "hebrew"],
});

export const metadata: Metadata = {
  title: "Atlas",
  description: APP_TAGLINE,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} antialiased`}>
        {/* Respects the OS-level "reduce motion" setting for every
            framer-motion animation in the app with one change, instead of
            each component re-implementing its own check (design/motion/a11y
            audit). "user" means it only ever reduces motion when the person
            has actually asked for that — never forced. */}
        <MotionConfig reducedMotion="user">
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
