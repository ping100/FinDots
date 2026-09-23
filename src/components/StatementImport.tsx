"use client";

import { useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import { pdfLines } from "@/lib/pdfText";
import { parseStatement, statementPeriod, type StatementRow } from "@/lib/statement";
import type { Draft } from "@/lib/importCsv";
import { useStore } from "./DataProvider";
import { Button, Field, FieldGroup, Sheet, inputClass, inputStyle } from "./ui";

/** Операция считается уже загруженной, если в тот же день была такая же сумма. */
function alreadyThere(
  row: StatementRow,
  seen: Set<string>,
): boolean {
  return seen.has(`${row.at.toDateString()}|${row.amount.toFixed(2)}|${row.kind}`);
}

export function StatementImport() {
  const { wallets, categories, transactions, profile, toBase, importDrafts } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [walletId, setWalletId] = useState("");
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const base = profile?.base_currency ?? "KZT";
  const money = wallets.filter((w) => !w.archived && (w.kind === "cash" || w.kind === "card"));
  const expenseCats = categories.filter((c) => !c.archived && c.kind === "expense" && !c.parent_id);
  const incomeCats = categories.filter((c) => !c.archived && c.kind === "income" && !c.parent_id);

  // То, что уже записано: по дню, сумме и направлению. Выписку грузят
  // повторно, и одни и те же операции не должны лечь дважды.
  const seen = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      if (t.type !== "expense" && t.type !== "income") continue;
      const at = new Date(t.occurred_at);
      const value = toBase(Number(t.amount), t.currency);
      set.add(`${at.toDateString()}|${value.toFixed(2)}|${t.type}`);
    }
    return set;
  }, [transactions, toBase]);

  const pick = async (file: File) => {
    setProblem(null);
    setResult(null);
    setBusy(true);
    try {
      const lines = await pdfLines(file);
      const parsed = parseStatement(lines, base);
      if (!parsed.length) {
        setProblem("В файле не нашлось операций. Подойдёт выписка из банка в PDF.");
        return;
      }
      setFileName(file.name);
      setRows(parsed);
      setWalletId(money[0]?.id ?? "");
      // Уже загруженные сразу снимаем — их видно, но галочка не стоит.
      setSkip(new Set(parsed.map((r, i) => (alreadyThere(r, seen) ? i : -1)).filter((i) => i >= 0)));
      setPicked({});
    } catch {
      setProblem("Не получилось прочитать файл — он повреждён или это не PDF");
    } finally {
      setBusy(false);
    }
  };

  const wallet = money.find((w) => w.id === walletId);
  const chosen = rows?.map((row, i) => ({ row, i })).filter(({ i }) => !skip.has(i)) ?? [];
  const ready = !!wallet && chosen.length > 0;

  const run = async () => {
    if (!wallet || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const drafts: Draft[] = chosen.map(({ row, i }) => ({
        at: row.at,
        amount: row.amount,
        kind: row.kind,
        // Не подставляем первую попавшуюся категорию: пополнение с чужой
        // карты — это не «Зарплата», пусть лучше ляжет в «Прочее».
        category: picked[i] || (row.kind === "income" ? "Прочий доход" : "Прочее"),
        subcategory: "",
        wallet: wallet.name,
        currency: row.currency,
        note: [row.operation, row.detail].filter(Boolean).join(" ").trim(),
      }));
      const done = await importDrafts(drafts);
      setResult(`Загружено ${done.added} ${plural(done.added, "операция", "операции", "операций")}`);
      setRows(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Не получилось загрузить");
    } finally {
      setBusy(false);
    }
  };

  const period = rows ? statementPeriod(rows) : null;

  return (
    <>
      <button
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        className="mb-2 flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left"
        style={{ border: "1px solid var(--border)" }}
      >
        <span className="text-sm">{busy && !rows ? "Читаю файл…" : "Загрузить выписку из банка"}</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          PDF
        </span>
      </button>

      {result ? (
        <p className="mb-2 text-sm" style={{ color: "var(--ok)" }}>
          {result}
        </p>
      ) : null}
      {problem && !rows ? (
        <p className="mb-2 text-sm" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
          e.target.value = "";
        }}
      />

      <Sheet
        open={!!rows}
        title="Выписка из банка"
        onClose={() => (busy ? undefined : setRows(null))}
        footer={
          <Button onClick={run} disabled={!ready || busy}>
            {busy
              ? "Загружаю…"
              : ready
                ? `Загрузить ${chosen.length} ${plural(chosen.length, "операцию", "операции", "операций")}`
                : money.length
                  ? "Отметьте, что загружать"
                  : "Сначала заведите кошелёк"}
          </Button>
        }
      >
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          {fileName}
          {period
            ? ` · ${period.from.toLocaleDateString("ru-RU")} — ${period.to.toLocaleDateString("ru-RU")}`
            : ""}
          {rows ? ` · ${rows.length} ${plural(rows.length, "операция", "операции", "операций")}` : ""}
        </p>

        <FieldGroup label="Карта или кошелёк" hint="Операции лягут на него">
          <div className="flex flex-wrap gap-2">
            {money.map((w) => (
              <button
                key={w.id}
                onClick={() => setWalletId(w.id)}
                className="rounded-full border px-3.5 py-2 text-sm"
                style={{
                  background: walletId === w.id ? "var(--accent)" : "var(--surface-2)",
                  borderColor: walletId === w.id ? "var(--accent)" : "var(--border)",
                  color: walletId === w.id ? "#fff" : "inherit",
                }}
              >
                {w.name}
              </button>
            ))}
          </div>
        </FieldGroup>

        <Field label="Что загрузить">
          <div className="space-y-1.5">
            {rows?.map((row, i) => {
              const off = skip.has(i);
              const dup = alreadyThere(row, seen);
              const list = row.kind === "income" ? incomeCats : expenseCats;
              return (
                <div
                  key={i}
                  className="rounded-2xl px-3 py-2"
                  style={{ background: "var(--surface-2)", opacity: off ? 0.45 : 1 }}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={!off}
                      onChange={() =>
                        setSkip((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem]">
                        {row.detail || row.operation || "операция"}
                      </span>
                      <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                        {row.at.toLocaleDateString("ru-RU")}
                        {row.operation ? ` · ${row.operation}` : ""}
                        {dup ? " · уже есть" : ""}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-[0.8125rem] font-semibold tabular-nums"
                      style={{ color: row.kind === "income" ? "var(--ok)" : "var(--danger)" }}
                    >
                      {row.kind === "income" ? "+" : "−"}
                      {formatMoney(row.amount, row.currency)}
                    </span>
                  </div>

                  {off ? null : (
                    <select
                      className={`${inputClass} mt-1.5 py-2 text-[0.8125rem]`}
                      style={inputStyle}
                      value={picked[i] ?? ""}
                      onChange={(e) => setPicked((prev) => ({ ...prev, [i]: e.target.value }))}
                    >
                      <option value="">
                        {row.kind === "income" ? "Прочий доход" : "Прочее"} — заведём
                      </option>
                      {list.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </Field>

        {problem ? (
          <p className="pb-2 text-sm" style={{ color: "var(--danger)" }}>
            {problem}
          </p>
        ) : null}

        <p className="pb-2 text-xs" style={{ color: "var(--muted)" }}>
          Файл читается на вашем телефоне и никуда не отправляется. Операции,
          которые уже записаны, отмечены и сняты — но совпадение ищется по дате
          и сумме, так что две одинаковые покупки в один день лучше проверить
          глазами.
        </p>
      </Sheet>
    </>
  );
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
