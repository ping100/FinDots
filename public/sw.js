// Кэш — свой у каждой версии приложения: версия приходит в адресе самого
// service worker (sw.js?v=…). Новая версия — новый worker, и при его
// включении прежний кэш удаляется.
//
// Два кэша:
// - статика (/_next/static, иконки) — берётся из кэша, она не меняется;
// - страницы приложения — чтобы оно открывалось без сети. Страница — только
//   оболочка: данные (деньги, задачи, цикл) в неё не зашиты, их приложение
//   грузит само и без сети берёт из своего снимка на телефоне. Страница
//   всегда сначала просится из сети, кэш — только когда сети нет. При выходе
//   из учётной записи приложение просит стереть страницы (clear-pages).
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `dots-static-${VERSION}`;
const PAGES = `dots-pages-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Какие страницы можно хранить: разделы приложения, без админки и API. */
function pageKey(url) {
  if (url.origin !== self.location.origin) return null;
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path.startsWith("/api") || path.startsWith("/admin") || path.startsWith("/auth") || path.startsWith("/_next")) return null;
  if (!/^\/(money|tasks|fem)?(\/[a-z-]+)?$/.test(path)) return null;
  return path;
}

const OFFLINE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dots</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f6f3fa;color:#221a2b;text-align:center;padding:24px">
<div><div style="font-size:40px">📡</div><p style="font-weight:700;font-size:18px;margin:12px 0 6px">Нет связи</p>
<p style="color:#857a8f;margin:0">Этот экран ещё не сохранён на телефоне. Откройте Dots с интернетом хотя бы раз — потом он будет открываться и без сети.</p>
<button onclick="location.reload()" style="margin-top:18px;border:0;border-radius:14px;padding:12px 20px;background:#3b82f6;color:#fff;font-weight:600;font-size:15px">Попробовать снова</button></div></body></html>`;

async function savePage(key, response) {
  if (!response || !response.ok || response.redirected || response.type !== "basic") return;
  const cache = await caches.open(PAGES);
  await cache.put(key, response);
}

/** Страница и её скрипты — в кэш, чтобы открывалась без сети. */
async function warm(path) {
  const cache = await caches.open(PAGES);
  if (await cache.match(path)) return;
  const res = await fetch(path, { credentials: "same-origin" }).catch(() => null);
  if (!res || !res.ok || res.redirected) return;
  const html = await res.clone().text();
  await cache.put(path, res);
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  const stat = await caches.open(CACHE);
  for (const url of assets) {
    if (await stat.match(url)) continue;
    const r = await fetch(url).catch(() => null);
    if (r && r.ok) await stat.put(url, r);
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.paths)) {
    event.waitUntil(data.paths.reduce((p, path) => p.then(() => warm(path)).catch(() => undefined), Promise.resolve()));
  }
  if (data.type === "clear-pages") {
    event.waitUntil(caches.delete(PAGES));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Страница: сначала сеть, без сети — сохранённая копия.
  if (request.mode === "navigate") {
    const key = pageKey(url);
    if (!key) return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          void savePage(key, response.clone());
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (
            (await cache.match(key)) ||
            new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } })
          );
        }),
    );
    return;
  }

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
