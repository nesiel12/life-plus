"use client";

import Link from "next/link";
import Image from "next/image";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  CalendarClock,
  Lightbulb,
  BookOpen,
  HeartHandshake,
  HeartPulse,
  History,
  Home,
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
import { useT, type TranslationKey } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  colorVar: string;
}

// A motion-enhanced <Link>, defined once at module scope (motion.create must
// not be called per-render) so nav rows get whileTap/whileHover physics
// without an extra wrapper element around the anchor.
const MotionLink = motion.create(Link);

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
  { href: "/calendar", labelKey: "nav.calendar", icon: CalendarClock, colorVar: "--accent-career" },
  { href: "/areas/learning", labelKey: "nav.learning", icon: Lightbulb, colorVar: "--accent-learning" },
  { href: "/areas/torah", labelKey: "nav.torah", icon: BookOpen, colorVar: "--accent-faith" },
  { href: "/areas/family", labelKey: "nav.family", icon: HeartHandshake, colorVar: "--accent-family" },
  { href: "/areas/health", labelKey: "nav.health", icon: HeartPulse, colorVar: "--accent-health" },
  { href: "/areas/finances", labelKey: "nav.finances", icon: Wallet, colorVar: "--accent-finance" },
  // Labelled "Personal", not by what it contains. The recovery space is
  // locked precisely so a bystander learns nothing from the screen.
  { href: "/areas/recovery", labelKey: "nav.recovery", icon: ShieldCheck, colorVar: "--muted" },
  { href: "/timeline", labelKey: "nav.timeline", icon: History, colorVar: "--muted" },
];

const HOME_ITEM: NavItem = { href: "/", labelKey: "nav.today", icon: Home, colorVar: "--gold" };

// Liquid spring for the active-item glass capsule and the icon pop — tuned
// for a quick, slightly overshooting settle (stiffness > damping²/4·mass)
// rather than the linear-feeling duration/easeOut this replaced. This is
// what makes the highlight read as *flowing* to the new item instead of
// just relocating there.
const LIQUID_SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 } as const;
const ICON_POP_TRANSITION = { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] } as const;

const iconVariants: Variants = {
  idle: { scale: 1, rotate: 0 },
  active: { scale: [1, 1.22, 1], rotate: [0, -8, 0] },
};

// A real pane of glass catches light where the pointer is, not uniformly —
// this feeds a radial highlight (see .nav-liquid-item::before in globals.css)
// with the pointer's position, so hovering genuinely looks like light
// crossing the surface rather than a flat background swap. Plain DOM style
// mutation, not React state: it fires on every pointermove and a re-render
// per pixel would be wasteful for a purely cosmetic effect.
function trackLiquidPointer(e: ReactPointerEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--liquid-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
  e.currentTarget.style.setProperty("--liquid-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const t = useT();
  const label = t(item.labelKey);
  const reduceMotion = useReducedMotion();

  return (
    <MotionLink
      href={item.href}
      onPointerMove={trackLiquidPointer}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      className={cn(
        "focus-ring nav-liquid-item group relative flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition-colors",
        // Glass only on hover for inactive rows; the active row gets its
        // frost from the accent pill below, which keeps its own colour.
        active ? "text-foreground" : "glass-control-hover text-muted hover:text-foreground"
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          transition={reduceMotion ? { duration: 0 } : LIQUID_SPRING}
          className="nav-liquid-active absolute inset-0 z-0 rounded-full"
          style={{ "--item-accent": `var(${item.colorVar})` } as CSSProperties}
        />
      )}
      <motion.span
        className="relative z-10 flex shrink-0 items-center justify-center"
        variants={iconVariants}
        animate={active ? "active" : "idle"}
        transition={reduceMotion ? { duration: 0 } : ICON_POP_TRANSITION}
      >
        <Icon size={18} style={active ? { color: `var(${item.colorVar})` } : undefined} aria-hidden />
      </motion.span>
      <span className="relative z-10 hidden lg:inline">{label}</span>
    </MotionLink>
  );
}

export function Sidebar() {
  const t = useT();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  return (
    <aside className="glass-panel nav-liquid-rail sticky top-0 hidden h-screen w-20 shrink-0 flex-col items-center border-s px-2 py-6 sm:flex lg:w-64 lg:items-stretch lg:px-4">
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
              className="focus-ring nav-liquid-item glass-control-hover grid size-9 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
              onPointerMove={trackLiquidPointer}
              aria-label={t("nav.settings")}
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
              className="focus-ring nav-liquid-item glass-control-hover rounded-full p-2 text-muted transition-colors hover:text-foreground"
              onPointerMove={trackLiquidPointer}
              aria-label={t("nav.signOut")}
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
  const t = useT();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const items = [HOME_ITEM, ...NAV_ITEMS];

  return (
    <nav className="glass-panel nav-liquid-rail fixed inset-x-0 bottom-0 z-30 flex items-center justify-around px-1 py-2 sm:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        // `startsWith` would light Home up on every route, since every path
        // starts with "/". Home is active only on an exact match.
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <MotionLink
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            // Same box the plain <Link> used before (icon + this padding,
            // nothing else) — the liquid pill is sized to *this* box via
            // absolute inset-0, not a separately-sized wrapper, so nine
            // items keep fitting a phone-width bar exactly as they always
            // did. A per-item circle with its own min-width previously
            // pushed the row past 375px and clipped the leading icon off
            // the edge of the screen.
            className="focus-ring nav-liquid-item relative flex flex-col items-center gap-0.5 rounded-full px-1.5 py-1.5"
            aria-label={t(item.labelKey)}
          >
            {active && (
              <motion.span
                layoutId="mobile-nav-active"
                transition={reduceMotion ? { duration: 0 } : LIQUID_SPRING}
                className="nav-liquid-active absolute inset-0 rounded-full"
                style={{ "--item-accent": `var(${item.colorVar})` } as CSSProperties}
              />
            )}
            <motion.span
              className="relative z-10 flex items-center justify-center"
              variants={iconVariants}
              animate={active ? "active" : "idle"}
              transition={reduceMotion ? { duration: 0 } : ICON_POP_TRANSITION}
            >
              <Icon size={18} style={active ? { color: `var(${item.colorVar})` } : undefined} className={!active ? "text-muted" : undefined} aria-hidden />
            </motion.span>
          </MotionLink>
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
