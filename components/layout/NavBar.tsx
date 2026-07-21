"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "היום" },
  { href: "/areas", label: "תחומי חיים" },
  { href: "/timeline", label: "ציר זמן" },
];

export function NavBar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-glass-border bg-background/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={22} />
          <span className="text-sm font-medium tracking-tight">{APP_NAME}</span>
        </Link>

        <ul className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-white/5 text-foreground" : "text-muted hover:text-foreground"
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {session?.user && (
          <div className="flex items-center gap-2">
            {session.user.image && (
              <Image
                src={session.user.image}
                alt={session.user.name ?? "avatar"}
                width={26}
                height={26}
                className="rounded-full"
              />
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="focus-ring rounded-lg p-2 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
              aria-label="התנתק"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </nav>
    </header>
  );
}
