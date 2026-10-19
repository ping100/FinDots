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
// зашифрованным для этого телефона, расшифровал его уже браузер. Кнопки
// (actions) — ответить прямо из уведомления; на iPhone их не будет.
self.addEventListener("push", (event) => {
  let message = { title: "Dots", body: "", url: "/", tag: undefined, actions: undefined, data: undefined };
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
      actions: Array.isArray(message.actions) ? message.actions.slice(0, 2) : undefined,
      data: { url: message.url, extra: message.data },
    }),
  );
});

// Открыть приложение на нужном экране; если оно уже открыто — перевести
// туда, а не плодить вторую копию.
function openApp(path) {
  const url = new URL(path || "/", self.location.origin).href;
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const open = windows.find((w) => w.url.startsWith(self.location.origin));
    if (open) return open.focus().then(() => open.navigate(url));
    return self.clients.openWindow(url);
  });
}

// Нажали кнопку — отвечаем на сервер без открытия приложения и коротко
// подтверждаем. Не вышло (нет входа, нет сети) — открываем приложение.
function answer(action, data) {
  const extra = (data && data.extra) || {};
  const body = { action, signal_id: extra.signal_id };
  return fetch("/api/fem-act", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return self.registration
        .showNotification("FemDots", {
          body: action === "send_heart" ? "Отправлено ❤️" : "Ответ отправлен ✓",
          tag: "fem-answered",
          silent: true,
          icon: "/icons/icon-192.png",
        })
        .then(() => new Promise((done) => setTimeout(done, 3000)))
        .then(() => self.registration.getNotifications({ tag: "fem-answered" }))
        .then((list) => list.forEach((n) => n.close()));
    })
    .catch(() => openApp((data && data.url) || "/fem"));
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  if (event.action) {
    event.waitUntil(answer(event.action, data));
    return;
  }
  event.waitUntil(openApp(data.url));
});
