/* DevPulse Web Push service worker */
self.addEventListener("push", (event) => {
  let data = {
    title: "DevPulse",
    body: "Você tem uma nova notificação.",
    href: "/app/notificacoes",
    tag: "devpulse-notification",
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = {
        title: String(parsed.title || data.title),
        body: String(parsed.body || data.body),
        href: String(parsed.href || data.href),
        tag: String(parsed.tag || data.tag),
      };
    }
  } catch {
    try {
      const text = event.data ? event.data.text() : "";
      if (text) {
        data.body = text;
      }
    } catch {
      // keep defaults
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/favicon-32.png",
      tag: data.tag,
      data: { href: data.href },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href =
    (event.notification.data && event.notification.data.href) ||
    "/app/notificacoes";
  const targetUrl = new URL(href, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // ignore navigate failures
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
