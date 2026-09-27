/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

// Bundled by app/serwist/[path]/route.ts (esbuild), not by Next — so this
// file is excluded from the root tsconfig and type-checked by tsconfig.sw.json.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Every /api/ response is per-person data. The Serwist default would keep
    // GETs in a shared "apis" cache; here they always go to the network, and
    // offline AI content comes from the React Query snapshot in IndexedDB
    // instead — one owner-checked, sign-out-wiped store, not two.
    { matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// Web Push — Daily Backbone alerts (routine-block reminders) reaching the OS
// notification tray, including when the app is closed. Serwist owns install/
// activate/fetch above; these two events are outside its scope, so they're
// registered directly, the same way the old standalone public/sw.js did.
interface PushPayload {
  title?: string;
  body?: string;
  kind?: string;
  url?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  let data: PushPayload = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Life Plus", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Life Plus";
  // `renotify` is standard (MDN, all evergreen browsers) but missing from
  // lib.webworker.d.ts's NotificationOptions as of this TS version.
  const options = {
    body: data.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    dir: "rtl",
    lang: "he",
    tag: data.kind || "life-plus",
    renotify: true,
    data: { url: data.url || "/" },
  } as NotificationOptions;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Focus an already-open tab and route it, rather than opening another.
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) (client as WindowClient).navigate(target).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
