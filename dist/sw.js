/* Service worker do ContentFlow AI: notificações push e instalação do app.
   Não guarda páginas em cache (o app sempre carrega a versão mais nova). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "ContentFlow AI", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "ContentFlow AI";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/app" },
    lang: "pt-BR",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ("navigate" in client) return client.navigate(target);
        return;
      }
    }
    return self.clients.openWindow(target);
  })());
});

// Necessário para alguns navegadores considerarem o app instalável.
self.addEventListener("fetch", () => {});
