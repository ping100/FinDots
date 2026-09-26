"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Уведомления на этом устройстве: можно ли, включены ли, включить, выключить.
 *
 * На iPhone пуши работают только у приложения, добавленного на экран
 * «Домой» (iOS 16.4 и новее): в обычной вкладке Safari их нет вовсе.
 */
export type PushState =
  | "unsupported" // браузер не умеет
  | "install" // iPhone в Safari: сначала на экран «Домой»
  | "denied" // человек запретил — вернуть можно только в настройках телефона
  | "off" // можно включить
  | "on"; // включены на этом устройстве

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function standalone(): boolean {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function pushState(): Promise<PushState> {
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!capable) return isIos() && !standalone() ? "install" : "unsupported";
  if (!KEY) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription && Notification.permission === "granted" ? "on" : "off";
  } catch {
    // Мобильный WebKit иногда роняет getRegistration()/getSubscription() —
    // без catch промис зависал без ответа, и usePushState() так и держал
    // null: весь блок «Уведомления» молча исчезал, будто его и не было.
    return "off";
  }
}

/** Включить. Звать только по нажатию: иначе iPhone не покажет запрос. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  // Если регистрация service worker не удалась (заблокировал расширение,
  // сорвалась загрузка /sw.js и т.п.), .ready зависает навсегда — кнопка
  // крутилась бы «Минуту…» бесконечно, без единой ошибки на экране.
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Не получилось подготовить уведомления — обновите страницу и попробуйте снова")), 8_000),
    ),
  ]);
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: fromBase64Url(KEY),
    }));

  const json = subscription.toJSON();
  const { error } = await createClient().rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
  });
  if (error) throw new Error(error.message);
  return "on";
}

/** Выключить на этом устройстве. */
export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await createClient().rpc("forget_push_subscription", { p_endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return "off";
}

/**
 * Пробное уведомление на свои устройства. Возвращает текст ошибки или null.
 *
 * Роут раньше отвечал 200 даже когда push не дошёл ни до одного
 * устройства (send failed, а не HTTP-отказ) — человек видел «Отправили»,
 * хотя на телефон ничего не пришло. Теперь смотрим на sent/total из тела.
 */
export async function testPush(): Promise<string | null> {
  const response = await fetch("/api/push/test", { method: "POST" });
  const body = (await response.json().catch(() => ({}))) as { error?: string; sent?: number; total?: number };
  if (!response.ok) return body.error ?? "Не получилось отправить";
  if (body.sent === 0) {
    return "Не дошло ни на одно устройство — проверьте, разрешены ли уведомления для Dots в настройках телефона";
  }
  if (body.total !== undefined && body.sent !== undefined && body.sent < body.total) {
    return `Дошло не на все устройства (${body.sent} из ${body.total})`;
  }
  return null;
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
