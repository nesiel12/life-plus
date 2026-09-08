"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Lightbulb,
  BookOpen,
  HeartHandshake,
  HeartPulse,
  History,
  Home,
  ListTodo,
  LogOut,
  Settings,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { KineticText } from "@/components/magicui/kinetic-text";
import { AnimatedThemeToggler } from "@/components/magicui/animated-theme-toggler";
import { useTheme } from "@/components/providers/ThemeProvider";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  colorVar: string;
}

// UI/UX Revamp: the primary nav, right-docked (RTL-conventional — the
// leading edge in Hebrew reading direction), replacing the old horizontal
// NavBar. Six items, exact Hebrew labels as specified, each tied to one of
// the app's own existing life-area accent tokens (app/globals.css) rather
// than a new arbitrary color per item — active state reads as "this life
// area," consistent with every other accent-colored surface in the app.
// On desktop, "Today" (home) isn't a labeled item — the logo above the nav is
// the home link, matching how a wordmark conventionally behaves. That reasoning
// does not survive the jump to a phone: MobileTabBar renders these items and
// *not* the logo, so on mobile there was no way back to the dashboard at all.
// HOME_ITEM is therefore prepended in MobileTabBar only.
const NAV_ITEMS: NavItem[] = [
  { href: "/calendar", label: "יומן חכם", icon: CalendarClock, colorVar: "--accent-career" },
  { href: "/areas/learning", label: "למידה", icon: Lightbulb, colorVar: "--accent-learning" },
  { href: "/areas/torah", label: "מרחב תורה", icon: BookOpen, colorVar: "--accent-faith" },
  // Directly under Torah Space — the two most-used screens sit together.
  { href: "/areas/time", label: "זמן ומשימות", icon: ListTodo, colorVar: "--accent-time" },
  { href: "/areas/family", label: "משפחה וחברים", icon: HeartHandshake, colorVar: "--accent-family" },
  { href: "/areas/health", label: "בריאות", icon: HeartPulse, colorVar: "--accent-health" },
  { href: "/areas/finances", label: "כספים", icon: Wallet, colorVar: "--accent-finance" },
  // Labelled "אישי", not by what it contains. The recovery space is locked
  // precisely so a bystander learns nothing from the screen, and a nav item
  // naming it would undo that before the lock ever gets a chance to work.
  { href: "/areas/recovery", label: "אישי", icon: ShieldCheck, colorVar: "--muted" },
  { href: "/timeline", label: "ציר זמן", icon: History, colorVar: "--muted" },
];

const HOME_ITEM: NavItem = { href: "/", label: "היום", icon: Home, colorVar: "--gold" };

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "focus-ring group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        // Glass only on hover for inactive rows; the active row gets its
        // frost from the accent pill below, which keeps its own colour.
        active ? "text-foreground" : "glass-control-hover text-muted hover:text-foreground"
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          transition={{ duration: 0.3, ease: "easeOut" }}
          // .glass-control supplies the backdrop blur and inset sheen; the
          // inline style below still wins for background/border/shadow, so
          // this row's life-area accent colour is exactly as it was.
          className="glass-control absolute inset-0 rounded-xl"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, var(${item.colorVar}) 22%, transparent), color-mix(in srgb, var(${item.colorVar}) 6%, transparent))`,
            border: `1px solid color-mix(in srgb, var(${item.colorVar}) 35%, transparent)`,
            boxShadow: `0 0 24px -8px color-mix(in srgb, var(${item.colorVar}) 55%, transparent)`,
          }}
        />
      )}
      <Icon
        size={18}
        className="relative shrink-0"
        style={active ? { color: `var(${item.colorVar})` } : undefined}
        aria-hidden
      />
      <span className="relative hidden lg:inline">{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  return (
    <aside className="glass-panel sticky top-0 hidden h-screen w-20 shrink-0 flex-col items-center border-s px-2 py-6 sm:flex lg:w-64 lg:items-stretch lg:px-4">
      <div className="relative mb-8 flex w-full flex-col items-center">
        <AnimatedThemeToggler
          theme={theme}
          onThemeChange={setTheme}
          className="absolute -top-1 start-0 hidden lg:flex"
        />
        <Link
          href="/"
          className="focus-ring flex flex-col items-center gap-2.5 rounded-xl px-2 py-1"
          aria-label={APP_NAME}
        >
          <Logo size={52} className="max-w-full" />
          {/* Hidden on the collapsed rail, where there's no room for it. */}
          <KineticText
            as="span"
            dir="ltr"
            text="LIFE PLUS"
            animateOnLoad
            delay={0.2}
            letterClassName="text-gold-gradient"
            className="hidden justify-center text-sm font-bold uppercase tracking-[0.3em] lg:flex"
          />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}
      </nav>

      {session?.user && (
        <div className="mt-4 flex flex-col gap-2 border-t border-glass-border pt-4">
          <div className="flex items-center justify-center gap-1 lg:justify-start">
            <NotificationCenter />
            <Link
              href="/settings"
              className="focus-ring glass-control-hover grid size-9 place-items-center rounded-lg text-muted transition-colors hover:text-foreground"
              aria-label="הגדרות"
            >
              <Settings size={17} aria-hidden />
            </Link>
          </div>
          <div className="flex items-center gap-2 lg:justify-between">
            <div className="flex items-center gap-2">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? "avatar"}
                  width={28}
                  height={28}
                  className="rounded-full ring-1 ring-glass-border"
                />
              )}
              <span className="hidden truncate text-xs text-muted lg:inline">{session.user.name}</span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="focus-ring rounded-lg p-2 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
              aria-label="התנתק"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

// Mobile fallback (< sm): the full sidebar doesn't fit a phone screen, so
// this renders a compact icon-only bottom bar with the same destinations
// instead of a slide-out drawer — one fewer interaction step on the surface
// most likely to be used one-handed.
//
// Home leads, because the desktop home affordance (the logo) isn't rendered
// here — without it the dashboard was unreachable from any area page on a
// phone except via the browser's back button.
export function MobileTabBar() {
  const pathname = usePathname();
  const items = [HOME_ITEM, ...NAV_ITEMS];

  return (
    <nav className="glass-panel fixed inset-x-0 bottom-0 z-30 flex items-center justify-around px-1 py-2 sm:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        // `startsWith` would light Home up on every route, since every path
        // starts with "/". Home is active only on an exact match.
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="focus-ring flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5"
            aria-label={item.label}
          >
            <Icon size={18} style={active ? { color: `var(${item.colorVar})` } : undefined} className={!active ? "text-muted" : undefined} aria-hidden />
          </Link>
        );
      })}

      {/* The sidebar isn't rendered below `sm`, so without this the bell —
          and with it every proactive notification the app produces — would be
          unreachable on a phone, which is where they matter most. */}
      <div className="flex items-center px-1.5">
        <NotificationCenter />
      </div>
    </nav>
  );
}
