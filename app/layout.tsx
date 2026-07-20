import type { Metadata } from "next";
import { Heebo } from "next/font/google";
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
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
