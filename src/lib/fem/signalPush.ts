import { BUY_ITEMS, REPLIES, signalText, unpackCustom, unpackInvite, whenText } from "./together";

/**
 * Текст пуша на сигнал пары и кнопки к нему. Кнопки шлют код ответа
 * (run, metoo…) на /api/fem-act — без открытия приложения. На iPhone
 * кнопок у веб-уведомлений нет: там нажатие просто открывает FemDots.
 */
export interface SignalRow {
  kind: string;
  item: string | null;
  from_name: string;
  discreet: boolean;
  reply_kind: string | null;
  reply_item: string | null;
}

export interface PushAction {
  action: string;
  title: string;
}

/** Какие ответы вынести кнопками (браузеры показывают не больше двух). */
const ACTIONS: Record<string, string[]> = {
  care: ["run", "soon"],
  custom: ["run", "soon"],
  buy: ["run", "bought"],
  alone: ["ok"],
  heart: ["metoo", "hug"],
  invite: ["yes", "no"],
};

/** Текст ответа по коду — сервер берёт его отсюда, а не из уведомления. */
export function presetText(kind: string, act: string): { text: string; done: boolean } | null {
  const p = REPLIES[kind]?.find((x) => x.act === act);
  return p ? { text: p.text, done: !!p.done } : null;
}

const almatyToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });

export function signalPush(row: SignalRow): { title: string; body: string; actions?: PushAction[] } {
  const name = row.from_name;
  if (row.discreet) return { title: "🌸 FemDots", body: `${name}: новое сообщение` };
  const actions = (ACTIONS[row.kind] ?? [])
    .map((act) => ({ action: act, title: presetText(row.kind, act)?.text ?? "" }))
    .filter((a) => a.title);
  const what = row.reply_kind ? signalText(row.reply_kind, row.reply_item).text : null;
  switch (row.kind) {
    case "care":
      return { title: `💗 ${name}`, body: "Нужна твоя забота — обними, принеси чай, просто будь рядом", actions };
    case "buy": {
      const it = BUY_ITEMS.find((x) => x.value === row.item);
      return { title: `🛍 ${name}`, body: `Купи, пожалуйста, по дороге: ${it ? it.label.toLowerCase() : "что-нибудь вкусное"}`, actions };
    }
    case "alone":
      return { title: `🌙 ${name}`, body: "Хочу немного побыть одна — это не про тебя 💗", actions };
    case "heart":
      return { title: `❤️ ${name}`, body: "Думаю о тебе", actions };
    case "custom": {
      const c = unpackCustom(row.item);
      return { title: `${c?.emoji ?? "💌"} ${name}`, body: c?.label ?? row.item ?? "Просьба", actions };
    }
    case "photo":
      return { title: `📷 ${name}`, body: "Новое фото. Откроется один раз" };
    case "msg":
      return { title: `💬 ${name}`, body: row.item ?? "Новое сообщение" };
    case "reply":
      return { title: `💬 ${name}`, body: what ? `${row.item ?? ""} — на «${what}»` : (row.item ?? "Ответ") };
    case "done":
      return { title: `✅ ${name}`, body: what ? `${row.item ?? "Готово"} — «${what}»` : (row.item ?? "Готово") };
    case "will":
      return { title: `💗 ${name}`, body: row.item ? `Прочитал совет на сегодня и обещает: «${row.item}»` : "Обещает позаботиться о тебе сегодня", actions };
    case "invite": {
      const inv = unpackInvite(row.item);
      return {
        title: `💌 ${name} зовёт`,
        body: inv ? `${inv.emoji} ${inv.label}, ${whenText(inv.day, inv.time, almatyToday())}` : "Провести вечер вместе",
        actions,
      };
    }
    case "intim":
      // Без подробностей на экране блокировки.
      return {
        title: "🌸 FemDots",
        body: `${name} добавил отметку — подтвердите`,
        actions: [
          { action: "intim_ok", title: "Да, было" },
          { action: "intim_no", title: "Не было" },
        ],
      };
    default:
      return { title: `🏃 ${name}`, body: "Уже бегу!" };
  }
}
