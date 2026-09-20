"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Loader2, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { launchOrigin } from "@/lib/motion/macLaunch";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types";

/** How often the bell re-reads, while the tab is actually visible. */
const POLL_INTERVAL_MS = 60_000;

/**
 * Where a notification's Approve/Modify affordance takes the user.
 *
 * Always a page. The notification never performs its own action — the user
 * lands on the surface that owns it and confirms there, which is the app's
 * standing rule (docs/ATLAS_BIBLE.md #4). An unrecognised action type yields
 * no button at all rather than a link that goes nowhere.
 */
function actionTarget(action: AppNotification["action"]): { route: string; label: string } | null {
  if (!action) return null;
  switch (action.type) {
    case "open_route": {
      const route = typeof action.payload?.route === "string" ? action.payload.route : null;
      // Same-origin app paths only — never an arbitrary URL from a payload.
      return route && route.startsWith("/") ? { route, label: "פתח" } : null;
    }
    case "create_calendar_event":
      return { route: "/calendar", label: "פתח את היומן" };
    case "reschedule_tasks":
      return { route: "/calendar", label: "פתח את היומן" };
    case "mark_contacted":
      return { route: "/areas/family", label: "פתח את אנשי הקשר" };
    case "review_material":
      return { route: "/areas/torah", label: "פתח את החומר" };
    default:
      return null;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "long" });
}

/**
 * The notification centre.
 *
 * The `notifications` table and the whole Proactive Engine that writes to it
 * shipped in M2, and nothing ever surfaced a single row — the queue existed
 * and was invisible. This is the reader.
 */
export function NotificationCenter() {
  const router = useRouter();

  const notifications = useAtlasStore((s) => s.notifications);
  const unreadCount = useAtlasStore((s) => s.notificationUnreadCount);
  const refresh = useAtlasStore((s) => s.refreshNotifications);
  const markRead = useAtlasStore((s) => s.markNotificationRead);
  const dismiss = useAtlasStore((s) => s.dismissNotification);
  const markAllRead = useAtlasStore((s) => s.markAllNotificationsRead);
  const hydrated = useAtlasStore((s) => s.hydrated);

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [origin, setOrigin] = useState<string | undefined>();
  const bellRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(() => {
    setRefreshing(true);
    setError(null);
    refresh()
      .catch(() => setError("לא הצלחנו לטעון התראות."))
      .finally(() => setRefreshing(false));
  }, [refresh]);

  // Poll only while the tab is visible, and re-read immediately on refocus.
  // A background tab polling every minute is pure cost: nobody is looking.
  useEffect(() => {
    if (!hydrated) return;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      refresh().catch(() => {
        // A failed background poll leaves the last good list on screen. Only
        // an explicit reload surfaces an error, because that one was asked for.
      });
    };

    const timer = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [hydrated, refresh]);

  function handleOpen(notification: AppNotification) {
    if (!notification.readAt) {
      markRead(notification.id).catch(() => {
        // Optimistic update already rolled back in the store; the row simply
        // stays unread, which is the truthful outcome.
      });
    }
  }

  function handleAct(notification: AppNotification) {
    const target = actionTarget(notification.action);
    if (!target) return;
    // Recorded as acted, then navigated. Nothing is executed here — the
    // destination page owns the action and its own confirmation.
    fetch(`/api/notifications/${notification.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "act" }),
    }).catch(() => {});
    setOpen(false);
    router.push(target.route);
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    // The panel grows out of the bell, as a macOS window grows out of its
    // Dock icon: the origin is the bell's center in the panel's coordinates.
    const bell = bellRef.current?.getBoundingClientRect();
    if (bell) {
      const width = Math.min(448, window.innerWidth - 32);
      const height = Math.min(600, window.innerHeight * 0.8);
      setOrigin(launchOrigin(bell, { width, height }, { width: window.innerWidth, height: window.innerHeight }));
    }
    setOpen(true);
    reload();
  }

  return (
    <>
      <button
        ref={bellRef}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount > 0 ? `התראות — ${unreadCount} חדשות` : "התראות"}
        className="focus-ring glass-control-hover relative grid size-9 place-items-center rounded-lg text-muted transition-colors hover:text-foreground"
      >
        <Bell size={17} aria-hidden />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -end-0.5 grid min-w-[1.05rem] place-items-center rounded-full bg-[var(--gold)] px-1 text-[0.6rem] font-bold leading-[1.05rem] text-[var(--background)]"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* A centered, portalled glass modal. It used to be a popover anchored
          inside the sidebar, whose backdrop-filter made the sidebar its
          containing block — so the panel was clipped to a sliver of screen. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        align="center"
        zIndex={Z_INDEX.panel}
        origin={origin}
        label="מרכז ההתראות"
        backdropClassName="bg-black/35 backdrop-blur-[3px]"
        panelClassName="flex max-h-[min(80vh,600px)] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-glass-border px-5 py-3.5">
          <p className="text-base font-semibold text-foreground">התראות</p>
          <div className="flex items-center gap-1">
            {refreshing && <Loader2 size={13} className="animate-spin text-muted" aria-hidden />}
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead().catch(() => {})}
                className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
              >
                <CheckCheck size={12} aria-hidden />
                סמן הכל כנקרא
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {error ? (
            <div className="flex flex-col items-center gap-2 px-4 py-9 text-center">
              <p className="text-sm text-foreground">{error}</p>
              <button
                onClick={reload}
                className="focus-ring glass-control rounded-lg px-3 py-1.5 text-xs text-foreground"
              >
                נסה שוב
              </button>
            </div>
          ) : !hydrated ? (
            <div className="flex flex-col gap-2 p-4" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-fill-subtle" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-fill-subtle text-muted">
                <Bell size={19} aria-hidden />
              </span>
              <p className="text-sm font-medium text-foreground">אין התראות חדשות</p>
              <p className="text-xs text-muted">כשיהיה משהו שכדאי שתדע, זה יופיע כאן.</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {notifications.map((notification) => {
                const target = actionTarget(notification.action);
                const unread = !notification.readAt;
                return (
                  <li
                    key={notification.id}
                    className={cn(
                      "group border-b border-glass-border/60 px-4 py-3 last:border-b-0",
                      unread && "bg-gold-soft/25"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => handleOpen(notification)}
                        className="focus-ring min-w-0 flex-1 text-start"
                      >
                        <p
                          className={cn(
                            "text-sm text-foreground",
                            unread ? "font-semibold" : "font-medium"
                          )}
                        >
                          {notification.title}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground/75">
                          {notification.body}
                        </p>
                        {notification.reason && (
                          <p className="mt-1 text-[0.68rem] italic text-muted">
                            {notification.reason}
                          </p>
                        )}
                        <p className="mt-1 text-[0.65rem] text-muted">
                          {relativeTime(notification.createdAt)}
                        </p>
                      </button>

                      <button
                        onClick={() => dismiss(notification.id).catch(() => {})}
                        aria-label={`הסתר את ההתראה ${notification.title}`}
                        className="focus-ring grid size-6 shrink-0 place-items-center rounded-md text-muted opacity-100 transition-colors hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      >
                        <X size={13} aria-hidden />
                      </button>
                    </div>

                    {target && (
                      <button
                        onClick={() => handleAct(notification)}
                        className="focus-ring mt-2 flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-[var(--background)] transition-opacity hover:opacity-85"
                      >
                        <Check size={12} aria-hidden />
                        {target.label}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
