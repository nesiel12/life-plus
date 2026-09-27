"use client";

import Link from "next/link";
import Image from "next/image";
import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  LayoutGrid,
  LogOut,
  Mic,
  Settings,
  ShieldCheck,
  Wallet,
  X,
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
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { onIdle } from "@/lib/dom/idle";

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
  const { theme, setPreference } = useTheme();

  return (
    <aside className="glass-panel nav-liquid-rail sticky top-0 hidden h-screen w-20 shrink-0 flex-col items-center border-s px-2 py-6 sm:flex lg:w-64 lg:items-stretch lg:px-4">
      <div className="relative mb-8 flex w-full flex-col items-center">
        <AnimatedThemeToggler
          theme={theme}
          onThemeChange={setPreference}
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

// Memoized: MobileTabBar re-renders on every pathname/optimistic-target
// change, which is every tap, but only the tab whose *own* active flag
// actually flipped needs to re-render — item/reduceMotion are stable
// references, so the other 3-4 tabs bail out on shallow-equal props instead
// of redoing their framer-motion variants and layout work for no reason.
const MobileTabBarLink = memo(function MobileTabBarLink({
  item,
  active,
  reduceMotion,
  onPressStart,
}: {
  item: NavItem;
  active: boolean;
  reduceMotion: boolean;
  /** Fires on pointerdown/touchstart — before Next's own navigation even starts — so the tab bar itself decides who lights up, not the router. */
  onPressStart: (href: string) => void;
}) {
  const t = useT();
  const Icon = item.icon;
  return (
    <MotionLink
      href={item.href}
      aria-current={active ? "page" : undefined}
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      onPointerDown={() => onPressStart(item.href)}
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
});

// Settings has no place in the desktop nav list (it's an icon under the rail)
// but on a phone it's one of the destinations people look for in "עוד".
const SETTINGS_ITEM: NavItem = { href: "/settings", labelKey: "nav.settings", icon: Settings, colorVar: "--muted" };
const MORE_SHEET_ITEMS: NavItem[] = [...OVERFLOW_MOBILE_ITEMS, SETTINGS_ITEM];

/** The "עוד" tab's bottom sheet: every destination that didn't fit the primary four. */
function MoreSheet({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const t = useT();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  return (
    <Modal open={open} onClose={onClose} label={t("nav.more")} sheet panelClassName="max-w-none px-4 pt-2">
      {/* The grabber: the familiar "this can be swiped down" handle. */}
      <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-hairline" />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">{t("nav.more")}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("nav.close")}
          className="focus-ring sheet-ghost-hover grid size-11 place-items-center rounded-full text-muted transition-colors"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <nav aria-label={t("nav.more")} className="grid grid-cols-3 gap-2.5">
        {MORE_SHEET_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring flex min-h-[5.25rem] flex-col items-center justify-center gap-2 rounded-2xl border px-1 text-center text-xs font-medium leading-tight transition-[transform,border-color] active:scale-[0.97]",
                active ? "text-foreground" : "border-hairline-card bg-surface/60 text-foreground"
              )}
              style={active ? { borderColor: `var(${item.colorVar})`, background: `color-mix(in srgb, var(${item.colorVar}) 10%, var(--surface))` } : undefined}
            >
              <span
                className="grid size-10 place-items-center rounded-full"
                style={{ background: `color-mix(in srgb, var(${item.colorVar}) 15%, transparent)`, color: `var(${item.colorVar})` }}
              >
                <Icon size={19} aria-hidden />
              </span>
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* Actions the desktop rail holds under the nav, which a phone never
          renders — the voice assistant, notifications, install. */}
      <div className="mt-4 flex items-center justify-center gap-3 border-t border-hairline-card pt-4">
        <VoiceAssistantTrigger className="size-11" />
        <NotificationCenter />
        <InstallPwaButton variant="icon" />
      </div>

      {session?.user && (
        <button
          type="button"
          onClick={() => void clearOfflineData(queryClient).finally(() => signOut({ callbackUrl: "/login" }))}
          className="focus-ring sheet-ghost-hover mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm text-muted transition-colors"
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
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = Boolean(useReducedMotion());
  const [moreOpen, setMoreOpen] = useState(false);

  // Moves the active pill the instant a finger touches a tab — pointerdown
  // fires before Next's own navigation even starts, let alone commits —
  // instead of waiting on usePathname() to catch up once the route
  // transition lands. Cleared the moment the real pathname agrees (the
  // navigation actually landed) or the person touches a different tab,
  // whichever comes first; a ref-tracked timeout is the backstop for a tap
  // whose navigation never lands (offline, a dropped chunk) so the bar
  // can't get stuck pointing at a route the app never reached.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPressStart = (href: string) => {
    setPendingHref(href);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => setPendingHref(null), 4000);
  };
  useEffect(() => {
    setPendingHref(null);
    return () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, [pathname]);
  const activeHref = pendingHref ?? pathname;

  const moreActive = MORE_SHEET_ITEMS.some((item) => activeHref.startsWith(item.href));
  // Hides while reading (scrolling down), returns on the first scroll up, and
  // is always shown on a newly opened page, at the top and at the bottom
  // (lib/ui/scrollDirection.ts). Never while the sheet it opens is up.
  const hidden = useScrollDirection(pathname) === "down" && !moreOpen;

  // Every destination reachable from a phone, not just the four visible
  // tabs — Next already prefetches those on its own since they're <Link>s
  // sitting in the viewport. The six behind "עוד" are inside a closed
  // sheet, never in the DOM until opened, so Next never sees them to
  // prefetch. Warmed once at idle so opening the sheet and tapping into it
  // costs no route-chunk or RSC round trip either.
  useEffect(() => onIdle(() => [...PRIMARY_MOBILE_ITEMS, ...MORE_SHEET_ITEMS].forEach((item) => router.prefetch(item.href))), [router]);

  return (
    <>
      {/* Edge-to-edge: the safe-area padding is on the bar itself (not a
          spacer below it), so the glass — not plain page background — is
          what reaches the home indicator. `translate`, not `transform`, is
          what Tailwind's translate-y utilities set, so nothing in the glass
          classes' CSS can override the slide. A keyboard user tabbing into
          it while it's tucked away brings it back — :focus-visible, not
          focus-within: closing the "עוד" sheet returns focus to its tab
          (correct dialog behaviour), and a plain focus rule then pinned the
          bar on screen for good (caught live). */}
      <nav
        className={cn(
          "glass-panel nav-liquid-rail fixed inset-x-0 bottom-0 z-30 flex items-center gap-0.5 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 shadow-lg transition-transform duration-300 ease-out has-[:focus-visible]:translate-y-0 motion-reduce:transition-none sm:hidden",
          hidden && "translate-y-full"
        )}
      >
        {PRIMARY_MOBILE_ITEMS.map((item) => {
          const active = item.href === "/" ? activeHref === "/" : activeHref.startsWith(item.href);
          return <MobileTabBarLink key={item.href} item={item} active={active} reduceMotion={reduceMotion} onPressStart={onPressStart} />;
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
            <LayoutGrid size={20} className={moreActive ? "text-foreground" : "text-muted"} aria-hidden />
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
 * rendered at all.
 *
 * Top corner, not mid-screen: a mid-left floating button sat over whatever
 * card happened to scroll underneath it (live-reported). The top corner is
 * the one strip of the screen no scrollable card ever reaches under this
 * app's own header layout. `env(safe-area-inset-top)` clears the iOS
 * status-bar/notch area the same way MobileTabBar already clears the home
 * indicator at the bottom.
 *
 * Positioned by a plain wrapper, not by the button itself. `.glass-control`
 * used to force `position: relative` over Tailwind's `fixed` (now fixed at
 * the source in globals.css) — the "floating" button was really an in-flow
 * flex item, a 36px column that squeezed the whole app to 339px on a 375px
 * phone (the blank strip down one side) and pushed the button half off
 * screen. The wrapper still matters: `.glass-control:active` sets its own
 * `transform`, which would replace this position with a jump on every press.
 *
 * `end-4` is the left edge in RTL and the right edge when the English locale
 * switches <html dir> to ltr (PreferencesProvider), so it stays on the
 * trailing side either way — InstallPwaBanner (also top, also mobile-only)
 * leaves exactly this corner clear (its own end- inset) so the two never
 * overlap when both are on screen.
 */
export function MobileThemeToggle() {
  const { theme, setPreference } = useTheme();
  return (
    <div className="fixed end-4 top-[max(1rem,env(safe-area-inset-top))] z-50 sm:hidden print:hidden">
      <AnimatedThemeToggler theme={theme} onThemeChange={setPreference} className="glass-control size-11 rounded-full text-foreground" />
    </div>
  );
}
