// Кэшируем только статику. Страницы и запросы к Supabase всегда идут в сеть:
// это финансовые данные, и на общем телефоне кэш страницы одного пользователя
// не должен достаться другому.
//
// Кэш — свой у каждой версии приложения: версия приходит в адресе самого
// service worker (sw.js?v=…). Новая версия — новый worker, и при его
// включении прежний кэш удаляется. Раньше кэш был один на всё время, и
// файлы каждой выкладки копились на телефоне бесконечно.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `dots-static-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest";
  if (!cacheable) return;

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          // Кэшируем только удачные ответы: закэшированная ошибка
          // отвечала бы ошибкой уже без всякой сети.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

// Пуш: сервер прислал напоминание — показываем уведомление. Текст пришёл
// зашифрованным для этого телефона, расшифровал его уже браузер.
self.addEventListener("push", (event) => {
  let message = { title: "Dots", body: "", url: "/", tag: undefined };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // Пустой или битый пуш — покажем хотя бы название приложения.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: message.url },
    }),
  );
});

// Нажали на уведомление — открываем приложение на нужном экране; если оно
// уже открыто, переводим туда, а не плодим вторую копию.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then(() => open.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
