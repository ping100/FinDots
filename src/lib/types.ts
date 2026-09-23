export type WalletKind = "cash" | "card" | "savings" | "debt_out" | "debt_in";
export type CategoryKind = "income" | "expense";
export type TxType = "income" | "allocation" | "expense" | "transfer" | "adjustment";

export type CurrencyCode = string;

export interface Profile {
  id: string;
  display_name: string | null;
  base_currency: CurrencyCode;
  theme: "dark" | "light";
  text_scale: "small" | "medium" | "large";
  ai_model: string;
  /** Приветствие после регистрации уже показывали. */
  onboarding_seen: boolean;
}

export interface ExchangeRate {
  code: CurrencyCode;
  rate_to_base: number;
}

export interface Wallet {
  id: string;
  kind: WalletKind;
  name: string;
  icon: string;
  color: string;
  currency: CurrencyCode;
  initial_balance: number;
  sort_order: number;
  archived: boolean;
  due_date: string | null;
  reminder_days: number | null;
  monthly_payment: number | null;
  is_recurring: boolean;
  recurring_day: number | null;
  note: string | null;
  // накопления: ставка годовых, срок, цель и отметка о начисленных процентах
  rate: number | null;
  term_end: string | null;
  goal: number | null;
  opened_on: string | null;
  interest_through: string | null;
}

export interface Category {
  id: string;
  kind: CategoryKind;
  name: string;
  icon: string;
  color: string;
  monthly_limit: number | null;
  sort_order: number;
  archived: boolean;
  /** Не null — это подкатегория: она живёт внутри своей категории, а не на главной. */
  parent_id: string | null;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  currency: CurrencyCode;
  category_id: string | null;
  /** Уточнение внутри категории; главная категория остаётся в category_id. */
  subcategory_id: string | null;
  wallet_id: string | null;
  from_wallet_id: string | null;
  to_wallet_id: string | null;
  parent_id: string | null;
  occurred_at: string;
  note: string | null;
}

export interface WalletBalance {
  wallet_id: string;
  currency: CurrencyCode;
  balance: number;
}

/** Нераспределённый остаток дохода по категории и валюте. */
export interface IncomePool {
  category_id: string;
  currency: CurrencyCode;
  unallocated: number;
}

/** Что именно тащат пальцем по экрану. */
export type DragPayload =
  | { source: "income"; categoryId: string; currency: CurrencyCode; available: number }
  | { source: "wallet"; walletId: string; currency: CurrencyCode; available: number };

/** Куда его можно бросить. */
export type DropTarget =
  | { target: "wallet"; walletId: string }
  | { target: "category"; categoryId: string };
