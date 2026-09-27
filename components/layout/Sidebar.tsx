"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
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
  MoreHorizontal,
  Mic,
  Settings,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Modal } from "@/components/ui/Modal";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { KineticText } from "@/components/magicui/kinetic-text";
import { AnimatedThemeToggler } from "@/components/magicui/animated-theme-toggler";
import { useTheme } from "@/components/providers/ThemeProvider";
import { APP_NAME } from "@/lib/constants";
import { useT, type TranslationKey } from "@/lib/i18n/useT";
import { requestVoiceAssistant } from "@/lib/voice/voiceAssistantEvent";
import { cn } from "@/lib/utils";
import { clearOfflineData } from "@/lib/query/offlineStore";
import { InstallPwaButton } from "@/components/ui/InstallPwaButton";

// The עוזר קולי's global trigger (components/features/voice/
// VoiceAssistantModal.tsx, mounted once in AppShell.tsx): a plain button
// here, not a link, since it opens a modal rather than navigating — kept
// next to NotificationCenter in both the desktop rail and MobileTabBar so
// it's reachable from every screen size, the same reasoning that already
// puts NotificationCenter in both places.
function VoiceAssistantTrigger({ className }: { className?: string }) {
  const t = useT();
  return (
    <button
      onClick={requestVoiceAssistant}
      aria-label={t("nav.voiceAssistant")}
      className={cn("focus-ring nav-liquid-item glass-control-hover grid size-9 place-items-center rounded-full text-accent-faith transition-colors hover:text-accent-faith", className)}
    >
      <Mic size={17} aria-hidden />
    </button>
  );
}

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
  const queryClient = useQueryClient();
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
            <VoiceAssistantTrigger />
            <NotificationCenter />
            <Link
              href="/settings"
              className="focus-ring nav-liquid-item glass-control-hover grid size-9 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
              onPointerMove={trackLiquidPointer}
              aria-label={t("nav.settings")}
            >
              <Settings size={17} aria-hidden />
            </Link>
            <InstallPwaButton variant="icon" />
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
              onClick={() => void clearOfflineData(queryClient).finally(() => signOut({ callbackUrl: "/login" }))}
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

// Mobile fallback (< sm): the full sidebar doesn't fit a phone screen. Nine
// destinations plus the mic and the bell don't fit a native-feeling bar with
// labels either — so this shows only the four most-visited ones by label
// (Home leads, since the desktop home affordance — the logo above the nav —
// isn't rendered here) plus a fifth "עוד" tab that opens the rest in a sheet,
// the same overflow pattern a native app reaches for once a tab bar passes
// ~5 items.
const PRIMARY_MOBILE_ITEMS: NavItem[] = [HOME_ITEM, NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[2]];
const OVERFLOW_MOBILE_ITEMS: NavItem[] = NAV_ITEMS.slice(3);

function MobileTabBarLink({ item, active, reduceMotion }: { item: NavItem; active: boolean; reduceMotion: boolean }) {
  const t = useT();
  const Icon = item.icon;
  return (
    <MotionLink
      href={item.href}
      aria-current={active ? "page" : undefined}
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      // min-h/min-w-11 (44px) meets the platform's own touch-target
      // guideline; the liquid pill is still sized to this exact box via
      // absolute inset-0, so it never grows past what four items plus the
      // "עוד" tab can fit on a 375px-wide screen.
      className="focus-ring nav-liquid-item relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5"
      aria-label={t(item.labelKey)}
    >
      {active && (
        <motion.span
          layoutId="mobile-nav-active"
          transition={reduceMotion ? { duration: 0 } : LIQUID_SPRING}
          className="nav-liquid-active absolute inset-0 rounded-2xl"
          style={{ "--item-accent": `var(${item.colorVar})` } as CSSProperties}
        />
      )}
      <motion.span
        className="relative z-10 flex items-center justify-center"
        variants={iconVariants}
        animate={active ? "active" : "idle"}
        transition={reduceMotion ? { duration: 0 } : ICON_POP_TRANSITION}
      >
        <Icon size={20} style={active ? { color: `var(${item.colorVar})` } : undefined} className={!active ? "text-muted" : undefined} aria-hidden />
      </motion.span>
      <span className={cn("relative z-10 text-[0.65rem] font-medium leading-none", active ? "text-foreground" : "text-muted")}>{t(item.labelKey)}</span>
    </MotionLink>
  );
}

/** The "עוד" tab's own bottom sheet: everything that didn't fit the primary four. */
function MoreSheet({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const t = useT();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={t("nav.more")}
      align="center"
      backdropClassName="items-end p-0 sm:p-0"
      panelClassName="w-full max-w-none rounded-b-none rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      origin="bottom center"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{t("nav.more")}</p>
        <button type="button" onClick={onClose} aria-label={t("nav.close")} className="focus-ring grid size-9 place-items-center rounded-full text-muted hover:text-foreground">
          <MoreHorizontal size={18} className="rotate-90" aria-hidden />
        </button>
      </div>

      {/* Quick actions unreachable elsewhere on a phone, since the desktop
          sidebar (where these normally live) isn't rendered below `sm`. */}
      <div className="mb-3 flex items-center gap-2 border-b border-hairline-card pb-3">
        <VoiceAssistantTrigger className="size-11" />
        <NotificationCenter />
        <InstallPwaButton variant="icon" />
        <Link href="/settings" onClick={onClose} aria-label={t("nav.settings")} className="focus-ring nav-liquid-item glass-control-hover grid size-11 place-items-center rounded-full text-muted transition-colors hover:text-foreground">
          <Settings size={18} aria-hidden />
        </Link>
      </div>

      <nav className="grid grid-cols-3 gap-2">
        {OVERFLOW_MOBILE_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "focus-ring flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-medium transition-colors",
                active ? "border-transparent text-foreground" : "border-hairline-card text-muted hover:text-foreground"
              )}
              style={active ? { background: `color-mix(in srgb, var(${item.colorVar}) 16%, transparent)`, color: `var(${item.colorVar})` } : undefined}
            >
              <Icon size={19} aria-hidden />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {session?.user && (
        <button
          type="button"
          onClick={() => void clearOfflineData(queryClient).finally(() => signOut({ callbackUrl: "/login" }))}
          className="focus-ring mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-hairline-card text-sm text-muted transition-colors hover:text-foreground"
        >
          <LogOut size={16} aria-hidden />
          {t("nav.signOut")}
        </button>
      )}
    </Modal>
  );
}

export function MobileTabBar() {
  const t = useT();
  const pathname = usePathname();
  const reduceMotion = Boolean(useReducedMotion());
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = OVERFLOW_MOBILE_ITEMS.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {/* Taller and edge-to-edge: the safe-area padding is on the bar itself
          (not a spacer below it), so the glass background — not a gap of
          plain page background — is what actually reaches the home
          indicator on an iPhone or the gesture bar on Android. */}
      <nav className="glass-panel nav-liquid-rail fixed inset-x-0 bottom-0 z-30 flex items-center gap-0.5 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 shadow-lg sm:hidden">
        {PRIMARY_MOBILE_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <MobileTabBarLink key={item.href} item={item} active={active} reduceMotion={reduceMotion} />;
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className="focus-ring nav-liquid-item relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5"
          aria-label={t("nav.more")}
        >
          {moreActive && (
            <motion.span
              layoutId="mobile-nav-active"
              transition={reduceMotion ? { duration: 0 } : LIQUID_SPRING}
              className="nav-liquid-active absolute inset-0 rounded-2xl"
              style={{ "--item-accent": "var(--muted)" } as CSSProperties}
            />
          )}
          <span className="relative z-10 flex items-center justify-center">
            <MoreHorizontal size={20} className={moreActive ? "text-foreground" : "text-muted"} aria-hidden />
          </span>
          <span className={cn("relative z-10 text-[0.65rem] font-medium leading-none", moreActive ? "text-foreground" : "text-muted")}>{t("nav.more")}</span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} pathname={pathname} />
    </>
  );
}

/**
 * The desktop toggle (Sidebar, above) stays completely untouched — this is a
 * second, independent control for the phone width where the sidebar isn't
 * rendered at all. Anchored to the inline-end edge at mid-height (`end-2`,
 * not `right-2`: the app is RTL, and a logical property keeps this the
 * correct physical side if that ever changes) rather than living in
 * MobileTabBar or the "עוד" sheet, so it's reachable in one tap from any
 * screen without opening anything first.
 */
export function MobileThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <AnimatedThemeToggler
      theme={theme}
      onThemeChange={setTheme}
      className="glass-control fixed end-2 top-1/2 z-40 -translate-y-1/2 rounded-full p-2.5 sm:hidden"
    />
  );
}
