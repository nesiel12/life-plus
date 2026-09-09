/* Life Plus service worker.
 *
 * Deliberately minimal: it exists for Web Push (Daily Backbone alerts on
 * mobile) and PWA installability — not offline caching. Adding a fetch
 * handler here would put a cache between the app and its own API for no
 * benefit, so there isn't one.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Life Plus", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Life Plus";
  const options = {
    body: data.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    dir: "rtl",
    lang: "he",
    tag: data.kind || "life-plus",
    renotify: true,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Focus an already-open tab and route it, rather than opening another.
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(target).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
