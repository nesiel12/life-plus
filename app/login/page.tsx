"use client";

import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/constants";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="glass-card flex w-full max-w-sm flex-col items-center gap-7 p-9"
      >
        <Logo size={44} />

        <div className="flex flex-col items-center gap-2.5">
          <span
            className="text-gold-gradient text-xl font-semibold uppercase leading-none"
            style={{ letterSpacing: "0.24em" }}
          >
            {APP_NAME}
          </span>
          <span aria-hidden className="block h-px w-14 bg-[var(--gold-line)]" />
        </div>

        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="focus-ring flex w-full items-center justify-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-[var(--background)] transition-transform hover:-translate-y-0.5"
        >
          <GoogleIcon />
          המשך עם Google
        </button>

        <p className="text-xs text-muted">Life Plus מחכה לך, רק תיכנס.</p>
      </motion.div>
    </main>
  );
}
