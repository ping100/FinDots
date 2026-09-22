"use client";

import { useEffect, useState } from "react";
import { formatMoney, parseAmount } from "@/lib/money";
import type { Wallet } from "@/lib/types";
import { useStore } from "./DataProvider";
import { KIND_LABEL } from "./WalletEditor";
import { Button, Field, Sheet, inputClass, inputStyle } from "./ui";

export function WalletSheet({
  wallet,
  onClose,
  onEdit,
}: {
  wallet: Wallet | null;
  onClose: () => void;
  onEdit: (wallet: Wallet) => void;
}) {
  const { balanceOf, setWalletBalance } = useStore();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const balance = wallet ? balanceOf(wallet.id) : 0;

  useEffect(() => {
    if (wallet) setValue(String(Math.round(balance * 100) / 100));
  }, [wallet, balance]);

  if (!wallet) return null;

  const isDebt = wallet.kind === "debt_out" || wallet.kind === "debt_in";

  const apply = async () => {
    const target = parseAmount(value);
    if (target == null || busy) return;
    setBusy(true);
    try {
      await setWalletBalance(wallet.id, target);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={wallet.name}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button onClick={apply} disabled={busy}>
            Сохранить баланс
          </Button>
          <Button variant="ghost" onClick={() => onEdit(wallet)}>
            Настройки кошелька
          </Button>
        </div>
      }
    >
      <div className="mb-4 rounded-2xl p-4" style={{ background: "var(--surface-2)" }}>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {KIND_LABEL[wallet.kind]}
          {isDebt ? " · остаток долга" : ""}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {formatMoney(balance, wallet.currency)}
        </p>
        {wallet.due_date ? (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Погасить до {new Date(wallet.due_date).toLocaleDateString("ru-RU")}
          </p>
        ) : null}
      </div>

      <Field
        label="Ручная корректировка"
        hint="Впиши фактический баланс — разница запишется отдельной операцией, история не пострадает"
      >
        <input
          className={inputClass}
          style={inputStyle}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>

      <p className="pb-2 text-xs" style={{ color: "var(--muted)" }}>
        Чтобы записать трату — перетащи этот кошелёк на категорию расхода. Чтобы
        перекинуть деньги — на другой кошелёк.
      </p>
    </Sheet>
  );
}
