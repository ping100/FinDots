import webpush from "web-push";

/**
 * Отправка пушей с сервера.
 *
 * Уведомление шифруется ключами самого телефона: Apple и Google его только
 * доставляют и прочитать не могут. Подписывается отправка закрытым ключом
 * VAPID — по нему службы пушей узнают, что пишет именно наше приложение.
 */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Одинаковый tag заменяет прежнее уведомление, а не копит стопку. */
  tag?: string;
}

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails("https://dotsapp.vercel.app", publicKey, privateKey);
  configured = true;
  return true;
}

/** Отправить. Возвращает «dead», если подписки больше нет и её пора убрать. */
export async function sendPush(target: PushTarget, message: PushMessage): Promise<"ok" | "dead" | "failed"> {
  if (!configure()) return "failed";
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      // Напоминание, пришедшее через сутки, никому не нужно.
      { TTL: 60 * 60, urgency: "high" },
    );
    return "ok";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    const body = (error as { body?: string }).body;
    // 404 и 410 — подписка умерла: приложение удалили или отозвали разрешение.
    if (status === 404 || status === 410) return "dead";
    // Остальное — реальная причина отказа (не тот VAPID-ключ, квота и
    // т.п.). Раньше терялась совсем: «Отправили» показывалось, даже если
    // до телефона ничего не доходило.
    console.error("sendPush failed", status, body);
    return "failed";
  }
}
