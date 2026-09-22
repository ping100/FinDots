"use client";

import { useEffect, useMemo, useState } from "react";
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
import { formatCompact, formatMoney, monthRange } from "@/lib/money";
import type { Category, DragPayload, Wallet } from "@/lib/types";
import { useStore } from "./DataProvider";
import { AmountSheet } from "./AmountSheet";
import { CategoryEditor } from "./CategoryEditor";
import { WalletEditor } from "./WalletEditor";
import { WalletSheet } from "./WalletSheet";
import { Bubble } from "./ui";

type Dialog =
  | { kind: "income"; category: Category }
  | { kind: "allocate"; category: Category; wallet: Wallet }
  | { kind: "expense"; category: Category; wallet?: Wallet }
  | { kind: "transfer"; from: Wallet; to: Wallet }
  | null;

export function HomeScreen() {
  const store = useStore();
  const {
    profile, wallets, categories, transactions,
    balanceOf, poolOf, toBase,
    addIncome, allocate, addExpense, addTransfer,
  } = store;

  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [walletSheet, setWalletSheet] = useState<Wallet | null>(null);
  const [walletEditor, setWalletEditor] = useState<{ wallet?: Wallet | null } | null>(null);
  const [categoryEditor, setCategoryEditor] =
    useState<{ kind: "income" | "expense"; category?: Category | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Подсказка о запрещённом переносе гаснет сама.
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

  const incomeCats = categories.filter((c) => c.kind === "income");
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const moneyWallets = wallets.filter((w) => w.kind === "cash" || w.kind === "card");

  /** Траты текущего и прошлого месяца в базовой валюте, по категориям. */
  const spend = useMemo(() => {
    const current = new Map<string, number>();
    const previous = new Map<string, number>();
    const thisMonth = monthRange(0);
    const lastMonth = monthRange(-1);

    for (const t of transactions) {
      if (t.type !== "expense" || !t.category_id) continue;
      const at = new Date(t.occurred_at);
      const value = toBase(Number(t.amount), t.currency);
      if (at >= thisMonth.from && at < thisMonth.to) {
        current.set(t.category_id, (current.get(t.category_id) ?? 0) + value);
      } else if (at >= lastMonth.from && at < lastMonth.to) {
        previous.set(t.category_id, (previous.get(t.category_id) ?? 0) + value);
      }
    }
    return { current, previous };
  }, [transactions, toBase]);

  const totals = useMemo(() => {
    const available = moneyWallets.reduce(
      (sum, w) => sum + toBase(balanceOf(w.id), w.currency),
      0,
    );
    const unallocated = incomeCats.reduce((sum, c) => {
      const pool = poolOf(c.id);
      return sum + toBase(pool.amount, pool.currency);
    }, 0);
    const spentThisMonth = [...spend.current.values()].reduce((a, b) => a + b, 0);
    const spentLastMonth = [...spend.previous.values()].reduce((a, b) => a + b, 0);
    return { available, unallocated, spentThisMonth, spentLastMonth };
  }, [moneyWallets, incomeCats, balanceOf, poolOf, toBase, spend]);

  const base = profile?.base_currency ?? "KZT";

  const onDragStart = (event: DragStartEvent) => {
    setDragging(event.active.data.current as DragPayload);
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const payload = event.active.data.current as DragPayload | undefined;
    const target = event.over?.data.current as
      | { target: "wallet"; walletId: string }
      | { target: "category"; categoryId: string }
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
      if (from.kind === "debt_out" || from.kind === "debt_in") {
        setToast("Тратить можно из наличных или с карты — долг не источник денег");
        return;
      }
      const category = expenseCats.find((c) => c.id === target.categoryId);
      if (category) setDialog({ kind: "expense", category, wallet: from });
      return;
    }

    const to = wallets.find((w) => w.id === target.walletId);
    if (to && to.id !== from.id) setDialog({ kind: "transfer", from, to });
  };

  return (
    <DndContext
      // Фиксированный id: иначе dnd-kit генерирует разные aria-describedby
      // на сервере и на клиенте, и React ругается на несовпадение разметки.
      id="money-grid"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="mx-auto w-full max-w-md px-4 pb-28 pt-3">
        <Summary
          base={base}
          available={totals.available}
          unallocated={totals.unallocated}
          spent={totals.spentThisMonth}
          spentLast={totals.spentLastMonth}
        />

        <Section title="Доходы" hint="Тап — записать доход. Потяни — разнести по кошелькам.">
          {incomeCats.map((category) => {
            const pool = poolOf(category.id);
            return (
              <IncomeBubble
                key={category.id}
                category={category}
                pool={pool}
                onTap={() => setDialog({ kind: "income", category })}
              />
            );
          })}
          <AddBubble
            label="Добавить"
            onClick={() => setCategoryEditor({ kind: "income", category: null })}
          />
        </Section>

        <Section title="Кошельки" hint="Тап — баланс. Потяни на расход или другой кошелёк.">
          {wallets.map((wallet) => (
            <WalletBubble
              key={wallet.id}
              wallet={wallet}
              balance={balanceOf(wallet.id)}
              dragActive={dragging?.source === "wallet" && dragging.walletId === wallet.id}
              onTap={() => setWalletSheet(wallet)}
            />
          ))}
          <AddBubble label="Добавить" onClick={() => setWalletEditor({ wallet: null })} />
        </Section>

        <Section title="Расходы" hint="Тап — записать трату. Или перетащи сюда кошелёк.">
          {expenseCats.map((category) => (
            <ExpenseBubble
              key={category.id}
              category={category}
              spent={spend.current.get(category.id) ?? 0}
              base={base}
              onTap={() => setDialog({ kind: "expense", category })}
              onHold={() => setCategoryEditor({ kind: "expense", category })}
            />
          ))}
          <AddBubble
            label="Добавить"
            onClick={() => setCategoryEditor({ kind: "expense", category: null })}
          />
        </Section>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? <DragGhost payload={dragging} /> : null}
      </DragOverlay>

      {toast ? (
        <button
          onClick={() => setToast(null)}
          className="animate-rise fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-2xl px-4 py-3 text-center text-sm text-white"
          style={{ background: "#334155" }}
        >
          {toast}
        </button>
      ) : null}

      {/* ─────────────── листы ввода ─────────────── */}

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
        title={
          dialog?.kind === "allocate"
            ? `${dialog.category.name} → ${dialog.wallet.name}`
            : ""
        }
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

// ───────────────────────────── блоки ─────────────────────────────

function Summary({
  base,
  available,
  unallocated,
  spent,
  spentLast,
}: {
  base: string;
  available: number;
  unallocated: number;
  spent: number;
  spentLast: number;
}) {
  const diff = spent - spentLast;
  const share = spentLast > 0 ? Math.round((diff / spentLast) * 100) : null;

  return (
    <div
      className="mb-4 rounded-3xl p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Доступно в кошельках
      </p>
      <p className="text-3xl font-bold tabular-nums">{formatMoney(available, base)}</p>
      <div className="mt-3 flex gap-4 text-xs" style={{ color: "var(--muted)" }}>
        <span>
          Не разнесено: <b className="tabular-nums">{formatCompact(unallocated, base)}</b>
        </span>
        <span>
          Потрачено: <b className="tabular-nums">{formatCompact(spent, base)}</b>
          {share != null ? (
            <b style={{ color: diff > 0 ? "var(--danger)" : "var(--ok)" }}>
              {" "}
              {diff > 0 ? "+" : ""}
              {share}%
            </b>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-0.5 text-sm font-semibold">{title}</h2>
      <p className="mb-2.5 text-[11px]" style={{ color: "var(--muted)" }}>
        {hint}
      </p>
      <div className="grid grid-cols-4 gap-y-3 justify-items-center">{children}</div>
    </section>
  );
}

// ──────────────────────────── пузырьки ───────────────────────────

/** Долгий тап по категории открывает её настройки. */
function useLongPress(onHold?: () => void) {
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  if (!onHold) return {};
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
  pool,
  onTap,
}: {
  category: Category;
  pool: { amount: number; currency: string };
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
      className="touch-none"
      style={{ touchAction: draggable ? "none" : undefined }}
      {...attributes}
      {...listeners}
    >
      <Bubble
        icon={category.icon}
        color={category.color}
        label={category.name}
        caption={draggable ? formatCompact(pool.amount, pool.currency) : undefined}
        dimmed={isDragging}
      />
    </button>
  );
}

function WalletBubble({
  wallet,
  balance,
  dragActive,
  onTap,
}: {
  wallet: Wallet;
  balance: number;
  dragActive: boolean;
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

  const isDebt = wallet.kind === "debt_out" || wallet.kind === "debt_in";

  return (
    <button
      ref={(node) => {
        dragRef(node);
        dropRef(node);
      }}
      onClick={onTap}
      style={{ touchAction: "none" }}
      {...attributes}
      {...listeners}
    >
      <Bubble
        icon={wallet.icon}
        color={wallet.color}
        label={wallet.name}
        caption={formatCompact(balance, wallet.currency)}
        dimmed={isDragging || dragActive}
        highlighted={isOver}
        badge={isDebt ? (wallet.kind === "debt_out" ? "долг" : "вернут") : undefined}
      />
    </button>
  );
}

function ExpenseBubble({
  category,
  spent,
  base,
  onTap,
  onHold,
}: {
  category: Category;
  spent: number;
  base: string;
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
    <button ref={setNodeRef} onClick={onTap} {...hold}>
      <Bubble
        icon={category.icon}
        color={category.color}
        label={category.name}
        caption={spent > 0 ? formatCompact(spent, base) : undefined}
        highlighted={isOver}
      />
      {limit ? (
        <span
          className="mx-auto mt-1 block h-1 w-12 overflow-hidden rounded-full"
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

function AddBubble({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}>
      <div className="flex w-[76px] flex-col items-center gap-1.5">
        <span
          className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-dashed"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <Icon name="plus" size={24} />
        </span>
        <span className="text-[11px]" style={{ color: "var(--muted)" }}>
          {label}
        </span>
      </div>
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

  // Призрак — плотная «монета» с суммой: подпись цели под ним остаётся читаемой.
  return (
    <div
      className="pointer-events-none flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 shadow-2xl"
      style={{ background: "var(--surface)", border: `2px solid ${item.color}` }}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: item.color, color: "#fff" }}
      >
        <Icon name={item.icon} size={22} />
      </span>
      <span className="whitespace-nowrap text-sm font-bold tabular-nums">
        {formatCompact(payload.available, payload.currency)}
      </span>
    </div>
  );
}
