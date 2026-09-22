"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Icon } from "@/lib/icons";
import { formatMoney, monthLabel, monthRange } from "@/lib/money";
import { gridColumns, scaleFactor } from "@/lib/textScale";
import type { Category, DragPayload, Wallet, WalletKind } from "@/lib/types";
import { useStore } from "./DataProvider";
import { AmountSheet } from "./AmountSheet";
import { DailyAllowance } from "./DailyAllowance";
import { CategoryEditor } from "./CategoryEditor";
import { WalletEditor } from "./WalletEditor";
import { WalletSheet } from "./WalletSheet";
import { AddBubble, Bubble, Button, PickerSheet, Sheet } from "./ui";

type Dialog =
  | { kind: "income"; category: Category }
  | { kind: "allocate"; category: Category; wallet: Wallet }
  | { kind: "expense"; category: Category; wallet?: Wallet }
  | { kind: "transfer"; from: Wallet; to: Wallet }
  | null;

/** Долги показаны на главной двумя сводными кружками, как в референсе. */
type DebtGroup = "debt_out" | "debt_in";

const DEBT_GROUP: Record<DebtGroup, { label: string; icon: string; color: string }> = {
  debt_out: { label: "Долги −", icon: "cash", color: "#e5383b" },
  debt_in: { label: "Долги +", icon: "cash", color: "#e5383b" },
};

export function HomeScreen() {
  const {
    profile, wallets, categories, transactions,
    balanceOf, poolOf, toBase,
    addIncome, allocate, addExpense, addTransfer, saveProfile,
  } = useStore();

  const [offset, setOffset] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [walletSheet, setWalletSheet] = useState<Wallet | null>(null);
  const [walletEditor, setWalletEditor] =
    useState<{ wallet?: Wallet | null; kind?: WalletKind } | null>(null);
  const [categoryEditor, setCategoryEditor] =
    useState<{ kind: "income" | "expense"; category?: Category | null } | null>(null);
  const [debtPicker, setDebtPicker] =
    useState<{ group: DebtGroup; payFrom?: Wallet } | null>(null);
  const [monthPicker, setMonthPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Короткое удержание: обычный тап остаётся тапом, а вертикальный
      // скролл списка не превращается в перетаскивание.
      activationConstraint: { delay: 160, tolerance: 8 },
    }),
  );

  const base = profile?.base_currency ?? "KZT";
  // Кружок в rem не выразить — размер иконки внутри SVG это число,
  // поэтому диаметр масштабируем тем же коэффициентом вручную.
  const bubble = Math.round(58 * scaleFactor(profile?.text_scale));
  const columns = gridColumns(profile?.text_scale);
  const incomeCats = categories.filter((c) => c.kind === "income");
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const moneyWallets = wallets.filter((w) => w.kind === "cash" || w.kind === "card");
  const debts = useMemo(
    () => ({
      debt_out: wallets.filter((w) => w.kind === "debt_out"),
      debt_in: wallets.filter((w) => w.kind === "debt_in"),
    }),
    [wallets],
  );

  /** Суммы выбранного месяца по категориям, в базовой валюте. */
  const month = useMemo(() => {
    const { from, to } = monthRange(offset);
    const income = new Map<string, number>();
    const expense = new Map<string, number>();
    for (const t of transactions) {
      const at = new Date(t.occurred_at);
      if (at < from || at >= to) continue;
      const value = toBase(Number(t.amount), t.currency);
      if (t.type === "income" && t.category_id) {
        income.set(t.category_id, (income.get(t.category_id) ?? 0) + value);
      }
      if (t.type === "expense" && t.category_id) {
        expense.set(t.category_id, (expense.get(t.category_id) ?? 0) + value);
      }
    }
    const sum = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0);
    return { income, expense, incomeTotal: sum(income), expenseTotal: sum(expense) };
  }, [transactions, offset, toBase]);

  const walletsTotal = moneyWallets.reduce(
    (sum, w) => sum + toBase(balanceOf(w.id), w.currency),
    0,
  );
  const debtTotal = (group: DebtGroup) =>
    debts[group].reduce((sum, w) => sum + toBase(balanceOf(w.id), w.currency), 0);

  // ─────────────────────────── перетаскивание ───────────────────────────

  const onDragEnd = (event: DragEndEvent) => {
    const payload = event.active.data.current as DragPayload | undefined;
    const target = event.over?.data.current as
      | { target: "wallet"; walletId: string }
      | { target: "category"; categoryId: string }
      | { target: "debts"; group: DebtGroup }
      | undefined;
    setDragging(null);
    if (!payload || !target) return;

    if (payload.source === "income") {
      if (target.target !== "wallet") {
        setToast("Доход сначала переносится в кошелёк, а уже оттуда в расход");
        return;
      }
      const category = incomeCats.find((c) => c.id === payload.categoryId);
      const wallet = wallets.find((w) => w.id === target.walletId);
      if (category && wallet) setDialog({ kind: "allocate", category, wallet });
      return;
    }

    const from = wallets.find((w) => w.id === payload.walletId);
    if (!from) return;

    if (target.target === "category") {
      const category = expenseCats.find((c) => c.id === target.categoryId);
      if (category) setDialog({ kind: "expense", category, wallet: from });
      return;
    }

    if (target.target === "debts") {
      const list = debts[target.group];
      if (list.length === 0) {
        setWalletEditor({ wallet: null, kind: target.group });
        return;
      }
      if (list.length === 1) {
        setDialog({ kind: "transfer", from, to: list[0] });
        return;
      }
      setDebtPicker({ group: target.group, payFrom: from });
      return;
    }

    const to = wallets.find((w) => w.id === target.walletId);
    if (to && to.id !== from.id) setDialog({ kind: "transfer", from, to });
  };

  return (
    <DndContext
      // Фиксированный id: иначе dnd-kit генерирует разные aria-describedby
      // на сервере и на клиенте, и React ругается на несовпадение разметки.
      id="findots"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(event: DragStartEvent) => {
        setDragging(event.active.data.current as DragPayload);
        if (navigator.vibrate) navigator.vibrate(8);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="mx-auto w-full max-w-md px-4 pb-32">
        <header className="flex items-center justify-between py-2">
          <Link
            href="/settings"
            className="flex h-10 w-10 items-center justify-center rounded-full text-base font-medium"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {(profile?.display_name ?? "?").slice(0, 1).toUpperCase()}
          </Link>
          <button
            onClick={() => setMonthPicker(true)}
            className="flex items-center gap-1.5 text-[0.9375rem] font-semibold uppercase tracking-wide"
          >
            {monthLabel(offset)}
            <Icon name="chevron-down" size={14} className="opacity-50" />
          </button>
          <button
            onClick={() => setMenu(true)}
            aria-label="Меню"
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <span className="text-lg leading-none">···</span>
          </button>
        </header>

        {/* Только для текущего месяца: для прошедших «сколько можно сегодня»
            смысла не имеет. */}
        {offset === 0 && moneyWallets.length > 0 ? <DailyAllowance /> : null}

        <Section
          columns={columns}
          title="Доходы"
          total={formatMoney(month.incomeTotal, base)}
          hint={incomeCats.length === 0 ? "Нажми «+» и заведи источник дохода: название, цвет, иконка." : undefined}
          collapsed={!!collapsed.income}
          onToggle={() => setCollapsed((c) => ({ ...c, income: !c.income }))}
        >
          {incomeCats.map((category) => (
            <IncomeBubble
              key={category.id}
              category={category}
              amount={month.income.get(category.id) ?? 0}
              pool={poolOf(category.id)}
              base={base}
              size={bubble}
              onTap={() => setDialog({ kind: "income", category })}
            />
          ))}
          <button onClick={() => setCategoryEditor({ kind: "income", category: null })} className="transition-transform duration-100 active:scale-95">
            <AddBubble size={bubble} />
          </button>
        </Section>

        <Section
          columns={columns}
          title="Кошельки"
          total={formatMoney(walletsTotal, base)}
          hint={wallets.length === 0 ? "Нажми «+»: наличные, карта или долг — что заведёшь, то и будет." : undefined}
          collapsed={!!collapsed.wallets}
          onToggle={() => setCollapsed((c) => ({ ...c, wallets: !c.wallets }))}
        >
          {moneyWallets.map((wallet) => (
            <WalletBubble
              key={wallet.id}
              wallet={wallet}
              balance={balanceOf(wallet.id)}
              size={bubble}
              onTap={() => setWalletSheet(wallet)}
            />
          ))}
          {(["debt_out", "debt_in"] as DebtGroup[])
            .filter((group) => debts[group].length > 0)
            .map((group) => (
              <DebtBubble
                key={group}
                group={group}
                amount={debtTotal(group)}
                base={base}
                size={bubble}
                onTap={() => setDebtPicker({ group })}
              />
            ))}
          <button onClick={() => setWalletEditor({ wallet: null, kind: "card" })} className="transition-transform duration-100 active:scale-95">
            <AddBubble size={bubble} />
          </button>
        </Section>

        <Section
          columns={columns}
          title="Расходы"
          total={formatMoney(month.expenseTotal, base)}
          hint={expenseCats.length === 0 ? "Нажми «+» и создай категорию трат — можно задать лимит на месяц." : undefined}
          collapsed={!!collapsed.expenses}
          onToggle={() => setCollapsed((c) => ({ ...c, expenses: !c.expenses }))}
        >
          {expenseCats.map((category) => (
            <ExpenseBubble
              key={category.id}
              category={category}
              spent={month.expense.get(category.id) ?? 0}
              base={base}
              size={bubble}
              onTap={() => setDialog({ kind: "expense", category })}
              onHold={() => setCategoryEditor({ kind: "expense", category })}
            />
          ))}
          <button onClick={() => setCategoryEditor({ kind: "expense", category: null })} className="transition-transform duration-100 active:scale-95">
            <AddBubble size={bubble} />
          </button>
        </Section>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? <DragGhost payload={dragging} /> : null}
      </DragOverlay>

      {toast ? (
        <button
          onClick={() => setToast(null)}
          className="animate-rise fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-2xl px-4 py-3 text-center text-sm text-white"
          style={{ background: "#3a3a3c" }}
        >
          {toast}
        </button>
      ) : null}

      {/* ─────────────────────────── листы ─────────────────────────── */}

      <AmountSheet
        open={dialog?.kind === "income"}
        title={dialog?.kind === "income" ? `Доход: ${dialog.category.name}` : ""}
        subtitle="Сумма ляжет в доход. Разнести по кошелькам — перетаскиванием."
        currency={base}
        extra={
          dialog?.kind === "income" ? (
            <button
              onClick={() => {
                const category = dialog.category;
                setDialog(null);
                setCategoryEditor({ kind: "income", category });
              }}
              className="rounded-full px-3 py-1 text-xs"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            >
              Настроить категорию
            </button>
          ) : null
        }
        onClose={() => setDialog(null)}
        onSubmit={async ({ amount, note, occurredAt }) => {
          if (dialog?.kind !== "income") return;
          await addIncome({
            categoryId: dialog.category.id,
            amount,
            currency: base,
            note,
            occurredAt,
          });
        }}
      />

      <AmountSheet
        open={dialog?.kind === "allocate"}
        title={dialog?.kind === "allocate" ? `${dialog.category.name} → ${dialog.wallet.name}` : ""}
        subtitle="Сколько из этого дохода положить в кошелёк"
        currency={dialog?.kind === "allocate" ? poolOf(dialog.category.id).currency : base}
        initial={dialog?.kind === "allocate" ? poolOf(dialog.category.id).amount : undefined}
        max={dialog?.kind === "allocate" ? poolOf(dialog.category.id).amount : undefined}
        submitLabel="Перенести"
        onClose={() => setDialog(null)}
        onSubmit={async ({ amount }) => {
          if (dialog?.kind !== "allocate") return;
          await allocate({
            categoryId: dialog.category.id,
            walletId: dialog.wallet.id,
            amount,
            currency: poolOf(dialog.category.id).currency,
          });
        }}
      />

      <AmountSheet
        open={dialog?.kind === "expense"}
        title={dialog?.kind === "expense" ? `Трата: ${dialog.category.name}` : ""}
        currency={dialog?.kind === "expense" ? (dialog.wallet?.currency ?? base) : base}
        max={
          dialog?.kind === "expense" && dialog.wallet
            ? Math.max(balanceOf(dialog.wallet.id), 0)
            : undefined
        }
        options={
          dialog?.kind === "expense" && !dialog.wallet
            ? moneyWallets.map((w) => ({
                id: w.id,
                name: w.name,
                caption: formatMoney(balanceOf(w.id), w.currency),
              }))
            : undefined
        }
        optionLabel="Откуда списать"
        submitLabel="Записать трату"
        onClose={() => setDialog(null)}
        onSubmit={async ({ amount, note, occurredAt, optionId }) => {
          if (dialog?.kind !== "expense") return;
          const wallet = dialog.wallet ?? wallets.find((w) => w.id === optionId);
          if (!wallet) throw new Error("Выбери кошелёк");
          await addExpense({
            categoryId: dialog.category.id,
            walletId: wallet.id,
            amount,
            currency: wallet.currency,
            note,
            occurredAt,
          });
        }}
      />

      <AmountSheet
        open={dialog?.kind === "transfer"}
        title={dialog?.kind === "transfer" ? `${dialog.from.name} → ${dialog.to.name}` : ""}
        subtitle={
          dialog?.kind === "transfer" && dialog.to.kind === "debt_out"
            ? "Погашение долга"
            : "Перенос между кошельками"
        }
        currency={dialog?.kind === "transfer" ? dialog.from.currency : base}
        max={
          dialog?.kind === "transfer" && dialog.from.kind !== "debt_out"
            ? Math.max(balanceOf(dialog.from.id), 0)
            : undefined
        }
        submitLabel="Перенести"
        onClose={() => setDialog(null)}
        onSubmit={async ({ amount, note, occurredAt }) => {
          if (dialog?.kind !== "transfer") return;
          await addTransfer({
            fromWalletId: dialog.from.id,
            toWalletId: dialog.to.id,
            amount,
            currency: dialog.from.currency,
            note,
            occurredAt,
          });
        }}
      />

      <PickerSheet
        open={!!debtPicker}
        title={
          debtPicker?.payFrom
            ? `Погасить с «${debtPicker.payFrom.name}»`
            : debtPicker?.group === "debt_in"
              ? "Мне должны"
              : "Я должен"
        }
        options={(debtPicker ? debts[debtPicker.group] : []).map((w) => ({
          id: w.id,
          name: w.name,
          caption: formatMoney(balanceOf(w.id), w.currency),
          color: w.color,
          icon: w.icon,
        }))}
        empty="Здесь пока пусто"
        addLabel="Добавить долг"
        onAdd={() => {
          const kind = debtPicker?.group;
          setDebtPicker(null);
          setWalletEditor({ wallet: null, kind });
        }}
        onPick={(id) => {
          const target = wallets.find((w) => w.id === id);
          const payFrom = debtPicker?.payFrom;
          setDebtPicker(null);
          if (!target) return;
          if (payFrom) setDialog({ kind: "transfer", from: payFrom, to: target });
          else setWalletSheet(target);
        }}
        onClose={() => setDebtPicker(null)}
      />

      <Sheet open={monthPicker} title="Месяц" onClose={() => setMonthPicker(false)}>
        <div className="grid grid-cols-2 gap-2 pb-2">
          {Array.from({ length: 18 }, (_, i) => -i).map((value) => (
            <button
              key={value}
              onClick={() => {
                setOffset(value);
                setMonthPicker(false);
              }}
              className="rounded-2xl px-3 py-2.5 text-sm capitalize"
              style={{
                background: offset === value ? "var(--accent)" : "var(--surface-2)",
                color: offset === value ? "#fff" : "inherit",
              }}
            >
              {monthLabel(value, true)}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={menu} title="Ещё" onClose={() => setMenu(false)}>
        <div className="space-y-2 pb-2">
          <Button
            variant="ghost"
            onClick={() =>
              saveProfile({ theme: profile?.theme === "dark" ? "light" : "dark" })
            }
          >
            {profile?.theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setCollapsed({ income: true, wallets: true, expenses: true })}
          >
            Свернуть все блоки
          </Button>
          <Link href="/settings" className="block">
            <Button variant="ghost">Настройки</Button>
          </Link>
        </div>
      </Sheet>

      <WalletSheet
        wallet={walletSheet}
        onClose={() => setWalletSheet(null)}
        onEdit={(wallet) => {
          setWalletSheet(null);
          setWalletEditor({ wallet });
        }}
      />

      <WalletEditor
        open={!!walletEditor}
        wallet={walletEditor?.wallet}
        defaultKind={walletEditor?.kind ?? "card"}
        onClose={() => setWalletEditor(null)}
      />

      <CategoryEditor
        open={!!categoryEditor}
        kind={categoryEditor?.kind ?? "expense"}
        category={categoryEditor?.category}
        onClose={() => setCategoryEditor(null)}
      />
    </DndContext>
  );
}

// ───────────────────────────── раскладка ─────────────────────────────

function Section({
  title,
  total,
  collapsed,
  onToggle,
  hint,
  columns,
  children,
}: {
  title: string;
  total: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Подсказка рядом с «+», пока в блоке нет ни одного кружка. */
  hint?: string;
  columns: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <button onClick={onToggle} className="flex items-center gap-2" aria-expanded={!collapsed}>
          <Icon
            name={collapsed ? "chevron-right" : "chevron-down"}
            size={15}
            style={{ color: "var(--muted)" }}
          />
          <h2 className="text-[1.0625rem] font-semibold">{title}</h2>
        </button>
        <span className="ml-auto text-[0.9375rem] font-semibold tabular-nums">{total}</span>
      </div>
      {collapsed ? null : (
        <div
          className="flex items-center rounded-2xl px-2 py-3"
          style={{ background: "var(--surface)" }}
        >
          <div
            className="grid flex-1 gap-x-1 gap-y-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {children}
          </div>
          {hint ? (
            <p className="max-w-[58%] shrink-0 pl-1 pr-2 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
              {hint}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ──────────────────────────── пузырьки ───────────────────────────

/** Долгое нажатие открывает настройки — только там, где жест не занят перетаскиванием. */
function useLongPress(onHold: () => void) {
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer) clearTimeout(timer);
    setTimer(null);
  };
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onHold();
    },
    onPointerDown: () => setTimer(setTimeout(onHold, 650)),
    onPointerUp: clear,
    onPointerLeave: clear,
  };
}

function IncomeBubble({
  category,
  amount,
  pool,
  base,
  size,
  onTap,
}: {
  category: Category;
  amount: number;
  pool: { amount: number; currency: string };
  base: string;
  size: number;
  onTap: () => void;
}) {
  const draggable = pool.amount > 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `income:${category.id}`,
    disabled: !draggable,
    data: {
      source: "income",
      categoryId: category.id,
      currency: pool.currency,
      available: pool.amount,
    },
  });

  return (
    <button
      ref={setNodeRef}
      onClick={onTap}
      className="transition-transform duration-100 active:scale-95"
      style={{ touchAction: draggable ? "none" : undefined }}
      {...attributes}
      {...listeners}
    >
      <Bubble
        icon={category.icon}
        color={category.color}
        label={category.name}
        amount={formatMoney(amount, base)}
        size={size}
        badge={draggable}
        dimmed={isDragging}
      />
    </button>
  );
}

function WalletBubble({
  wallet,
  balance,
  size,
  onTap,
}: {
  wallet: Wallet;
  balance: number;
  size: number;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: `wallet:${wallet.id}`,
    data: {
      source: "wallet",
      walletId: wallet.id,
      currency: wallet.currency,
      available: balance,
    },
  });
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `drop-wallet:${wallet.id}`,
    data: { target: "wallet", walletId: wallet.id },
  });

  return (
    <button
      ref={(node) => {
        dragRef(node);
        dropRef(node);
      }}
      onClick={onTap}
      className="transition-transform duration-100 active:scale-95"
      style={{ touchAction: "none" }}
      {...attributes}
      {...listeners}
    >
      <Bubble
        icon={wallet.icon}
        color={wallet.color}
        label={wallet.name}
        amount={formatMoney(balance, wallet.currency)}
        size={size}
        dimmed={isDragging}
        highlighted={isOver}
      />
    </button>
  );
}

function DebtBubble({
  group,
  amount,
  base,
  size,
  onTap,
}: {
  group: DebtGroup;
  amount: number;
  base: string;
  size: number;
  onTap: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-debts:${group}`,
    data: { target: "debts", group },
  });
  const style = DEBT_GROUP[group];
  // «Я должен» показываем со знаком минус — это обязательство, а не деньги.
  const shown = group === "debt_out" ? -amount : amount;

  return (
    <button ref={setNodeRef} onClick={onTap} className="transition-transform duration-100 active:scale-95">
      <Bubble
        icon={style.icon}
        color={style.color}
        label={style.label}
        size={size}
        amount={amount === 0 ? formatMoney(0, base) : formatMoney(shown, base)}
        muted={group === "debt_out"}
        highlighted={isOver}
      />
    </button>
  );
}

function ExpenseBubble({
  category,
  spent,
  base,
  size,
  onTap,
  onHold,
}: {
  category: Category;
  spent: number;
  base: string;
  size: number;
  onTap: () => void;
  onHold: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-category:${category.id}`,
    data: { target: "category", categoryId: category.id },
  });
  const hold = useLongPress(onHold);

  const limit = category.monthly_limit ?? null;
  const ratio = limit ? Math.min(spent / limit, 1) : 0;
  const over = limit != null && spent > limit;

  return (
    <button ref={setNodeRef} onClick={onTap} className="transition-transform duration-100 active:scale-95" {...hold}>
      <Bubble
        icon={category.icon}
        color={category.color}
        label={category.name}
        amount={formatMoney(spent, base)}
        size={size}
        highlighted={isOver}
      />
      {limit ? (
        <span
          className="mx-auto -mt-0.5 block h-1 w-10 overflow-hidden rounded-full"
          style={{ background: "var(--surface-2)" }}
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${ratio * 100}%`,
              background: over ? "var(--danger)" : category.color,
            }}
          />
        </span>
      ) : null}
    </button>
  );
}

function DragGhost({ payload }: { payload: DragPayload }) {
  const { wallets, categories } = useStore();
  const item =
    payload.source === "wallet"
      ? wallets.find((w) => w.id === payload.walletId)
      : categories.find((c) => c.id === payload.categoryId);
  if (!item) return null;

  // dnd-kit растягивает слой перетаскивания по рамке исходной кнопки, а не
  // по содержимому. Поэтому призрак не рисуем в потоке, а центрируем внутри
  // этой рамки — иначе он съезжает вниз-вправо и налезает на сам кружок.
  return (
    <div className="pointer-events-none relative h-full w-full">
      {/* Приподнят над точкой касания: иначе палец и сам призрак закрывают
          кружок, на который целишься. Попадание считается по указателю,
          так что сдвиг ни на что не влияет. */}
      <div
        className="absolute left-1/2 top-1/2 flex flex-col items-center gap-1.5"
        style={{ transform: "translate(-50%, calc(-50% - 26px))" }}
      >
        <span
          className="flex h-[60px] w-[60px] items-center justify-center rounded-full text-white"
          style={{
            background: item.color,
            boxShadow: `0 10px 26px ${item.color}66, 0 0 0 4px var(--surface)`,
          }}
        >
          <Icon name={item.icon} size={28} />
        </span>
        <span
          className="whitespace-nowrap rounded-full px-2.5 py-1 text-[0.75rem] font-semibold tabular-nums shadow-lg"
          style={{ background: "var(--surface)", border: `1px solid ${item.color}` }}
        >
          {formatMoney(payload.available, payload.currency)}
        </span>
      </div>
    </div>
  );
}
