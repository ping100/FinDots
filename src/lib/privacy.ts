import { useSyncExternalStore } from "react";

/**
 * «Глазок»: скрыть все суммы на экране — показать приложение в метро,
 * на работе, кому-то через плечо.
 *
 * Флаг живёт на уровне модуля, а не в состоянии компонента: его читает
 * formatMoney, а она вызывается в десятках мест и ничего не знает о React.
 * Перерисовку после переключения обеспечивает DataProvider — флаг входит в
 * его значение, и все экраны денег перерисовываются вместе с ним.
 *
 * Запоминается на устройстве, а не в профиле: скрывают от тех, кто рядом
 * с этим телефоном, и на ноутбуке дома суммы прятать незачем.
 */
const KEY = "dots.hideMoney";
export const MASK = "••••";

let hidden = read();
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function moneyHidden(): boolean {
  return hidden;
}

export function setMoneyHidden(value: boolean): void {
  hidden = value;
  try {
    if (value) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Хранилище закрыто — скрытие продержится до перезагрузки.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMoneyHidden(): boolean {
  return useSyncExternalStore(subscribe, moneyHidden, () => false);
}

/**
 * Числа в свободном тексте (разбор бюджета от ИИ): формат там какой
 * угодно — «12 500 ₸», «12,5 тыс», «40%», — поэтому скрываем любые цифры.
 */
export function maskDigits(text: string): string {
  return text.replace(/\d(?:[\d .,\u00a0\u202f]*\d)?/g, MASK);
}
