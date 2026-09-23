"use client";

import { useRef, useState } from "react";
import { parseCsv, toCsv } from "@/lib/csv";
import { COLUMNS, buildDrafts, guessMapping, summarize, type Draft, type Mapping } from "@/lib/importCsv";
import { formatMoney } from "@/lib/money";
import type { Transaction, TxType } from "@/lib/types";
import { useStore } from "./DataProvider";
import { Button, Field, FieldGroup, Sheet, inputClass, inputStyle } from "./ui";

const TYPE_LABEL: Record<TxType, string> = {
  income: "Доход",
  allocation: "В кошелёк",
  expense: "Трата",
  transfer: "Перенос",
  adjustment: "Корректировка",
};

/**
 * Обмен данными с другими программами.
 *
 * Выгрузка — один файл со всеми операциями, который открывается в Excel.
 * Загрузка — мастер: у каждой программы свои заголовки, поэтому колонки
 * сопоставляет человек, а мы лишь угадываем и показываем, что получится.
 */
export function DataTransfer({ onlyImport = false }: { onlyImport?: boolean } = {}) {
  const { transactions, categories, wallets, profile, importDrafts } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const base = profile?.base_currency ?? "KZT";
  const nameOfCategory = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
  const nameOfWallet = (id: string | null) => wallets.find((w) => w.id === id)?.name ?? "";

  // ───────────────────────────── выгрузка ─────────────────────────────

  const exportCsv = () => {
    const parentOf = (t: Transaction) =>
      transactions.find((p) => p.id === t.parent_id)?.category_id ?? null;

    const rows: (string | number)[][] = [
      ["дата", "тип", "сумма", "валюта", "категория", "подкатегория", "кошелёк", "откуда", "куда", "комментарий"],
      ...transactions.map((t) => [
        new Date(t.occurred_at).toLocaleDateString("ru-RU"),
        TYPE_LABEL[t.type],
        // Знак как в обычной выгрузке: трата — минус. Так файл понятен и
        // человеку, и любой программе, которая читает его по знаку суммы.
        (t.type === "expense" ? -Number(t.amount) : Number(t.amount)).toFixed(2).replace(".", ","),
        t.currency,
        nameOfCategory(t.type === "allocation" ? parentOf(t) : t.category_id),
        nameOfCategory(t.subcategory_id),
        nameOfWallet(t.wallet_id),
        nameOfWallet(t.from_wallet_id),
        nameOfWallet(t.to_wallet_id),
        t.note ?? "",
      ]),
    ];

    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `findots-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ───────────────────────────── загрузка ─────────────────────────────

  const pickFile = async (file: File) => {
    setProblem(null);
    setResult(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setProblem("В файле не нашлось строк с данными");
      return;
    }
    setFileName(file.name);
    setRows(parsed);
    setHasHeader(true);
    setMapping(guessMapping(parsed[0]));
  };

  const headers = rows?.[0] ?? [];
  const built = rows ? buildDrafts(rows, mapping, base, hasHeader) : null;
  const preview = built && rows
    ? summarize(
        built.drafts,
        categories.filter((c) => !c.archived),
        wallets.filter((w) => !w.archived),
      )
    : null;
  // Сравниваем с null, а не проверяем на истинность: дата почти всегда первая
  // колонка, её индекс 0 — и на «!!» импорт молча оставался бы заблокирован.
  const ready = mapping.date != null && mapping.amount != null && !!built?.drafts.length;

  const runImport = async () => {
    if (!built || busy) return;
    setBusy(true);
    setProblem(null);
    setProgress({ done: 0, total: built.drafts.length });
    try {
      const done = await importDrafts(built.drafts, (d, total) => setProgress({ done: d, total }));
      setResult(
        `Загружено ${done.added} ${plural(done.added, "операция", "операции", "операций")}` +
          (done.categories ? `, новых категорий: ${done.categories}` : "") +
          (done.wallets ? `, новых кошельков: ${done.wallets}` : ""),
      );
      setRows(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Не получилось загрузить");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <>
      <div className="mb-2 overflow-hidden rounded-2xl" style={{ border: "1px solid var(--border)" }}>
        {/* В приветствии выгружать нечего — у нового пользователя пусто. */}
        {onlyImport ? null : (
          <button onClick={exportCsv} className="flex w-full items-center justify-between px-4 py-3.5 text-left">
            <span className="text-sm">Выгрузить в CSV</span>
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {transactions.length} {plural(transactions.length, "операция", "операции", "операций")}
            </span>
          </button>
        )}
        <button
          onClick={() => fileInput.current?.click()}
          className="flex w-full items-center justify-between px-4 py-3.5 text-left"
          style={{ borderTop: onlyImport ? undefined : "1px solid var(--border)" }}
        >
          <span className="text-sm">Загрузить из CSV</span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            из другой программы
          </span>
        </button>
      </div>

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
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickFile(file);
          e.target.value = "";
        }}
      />

      <Sheet
        open={!!rows}
        title="Загрузка из файла"
        onClose={() => (busy ? undefined : setRows(null))}
        footer={
          <Button onClick={runImport} disabled={!ready || busy}>
            {progress
              ? `Загружаю… ${progress.done} из ${progress.total}`
              : ready
                ? `Загрузить ${built?.drafts.length} ${plural(built?.drafts.length ?? 0, "операцию", "операции", "операций")}`
                : "Укажите дату и сумму"}
          </Button>
        }
      >
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          {fileName} · {(rows?.length ?? 0) - (hasHeader ? 1 : 0)}{" "}
          {plural((rows?.length ?? 0) - (hasHeader ? 1 : 0), "строка", "строки", "строк")}
        </p>

        <label className="mb-3 flex items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
          />
          <span className="text-sm">Первая строка — заголовки</span>
        </label>

        <FieldGroup
          label="Какая колонка что значит"
          hint="Мы угадали по заголовкам — проверьте и поправьте"
        >
          <div className="space-y-2">
            {COLUMNS.map((column) => (
              <div key={column.id} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-sm">
                  {column.label}
                  <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                    {column.hint}
                  </span>
                </span>
                <select
                  className={inputClass}
                  style={inputStyle}
                  value={mapping[column.id] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [column.id]: e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">— нет —</option>
                  {headers.map((header, index) => (
                    <option key={index} value={index}>
                      {hasHeader ? header || `колонка ${index + 1}` : `колонка ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </FieldGroup>

        {preview && built ? (
          <Field label="Что получится">
            <div className="rounded-2xl p-3.5 text-sm" style={{ background: "var(--surface-2)" }}>
              <Line label="Доходов" value={String(preview.income)} />
              <Line label="Трат" value={String(preview.expense)} />
              {built.skipped ? (
                <Line
                  label="Пропущено строк"
                  value={String(built.skipped)}
                  hint="без разборчивой даты или суммы"
                />
              ) : null}
              {preview.newWallets.length ? (
                <Line label="Заведём кошельков" value={preview.newWallets.join(", ")} />
              ) : null}
              {preview.newCategories.length ? (
                <Line label="Заведём категорий" value={preview.newCategories.join(", ")} />
              ) : null}
            </div>

            {built.drafts.length ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                  Первые строки — проверьте, что суммы и даты разобраны верно:
                </p>
                {built.drafts.slice(0, 3).map((draft, i) => (
                  <PreviewRow key={i} draft={draft} />
                ))}
              </div>
            ) : null}
          </Field>
        ) : null}

        {problem ? (
          <p className="pb-2 text-sm" style={{ color: "var(--danger)" }}>
            {problem}
          </p>
        ) : null}

        <p className="pb-2 text-xs" style={{ color: "var(--muted)" }}>
          Загрузка только добавляет операции и ничего не удаляет. Повторная
          загрузка того же файла заведёт их второй раз — проверьте, что грузите
          новое.
        </p>
      </Sheet>
    </>
  );
}

function PreviewRow({ draft }: { draft: Draft }) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 rounded-xl px-3 py-2 text-[0.75rem]"
      style={{ background: "var(--surface-2)" }}
    >
      <span className="truncate">
        {draft.at.toLocaleDateString("ru-RU")} · {draft.category}
        {draft.subcategory ? ` → ${draft.subcategory}` : ""} · {draft.wallet}
      </span>
      <span
        className="shrink-0 tabular-nums"
        style={{ color: draft.kind === "income" ? "var(--ok)" : "var(--danger)" }}
      >
        {draft.kind === "income" ? "+" : "−"}
        {formatMoney(draft.amount, draft.currency)}
      </span>
    </div>
  );
}

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span style={{ color: "var(--muted)" }}>
        {label}
        {hint ? (
          <span className="block text-[0.6875rem]">{hint}</span>
        ) : null}
      </span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
