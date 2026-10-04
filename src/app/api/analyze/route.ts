import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/aiConfig";
import {
  buildAnalysisSummary,
  type SummaryCategory,
  type SummaryTx,
  type SummaryWallet,
} from "@/lib/analysisSummary";

export const runtime = "nodejs";
// «Думающие» модели пишут черновик рассуждений перед ответом и могут не
// уложиться в дефолтный лимит функции. 60 — максимум, что разрешает план
// Vercel Hobby; больше поставить нельзя без перехода на Pro.
export const maxDuration = 60;

// Ключ теперь общий (админский) — лимит защищает его счёт от того, чтобы
// один зациклившийся человек не сжёг весь дневной бюджет на всех.
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 20);
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

const SYSTEM_PROMPT = [
  "Ты финансовый помощник. Пиши только на русском языке, коротко и конкретно, без вступлений.",
  "Не показывай ход рассуждений и не пересказывай это задание — сразу давай готовый разбор.",
  "Структура ответа — ровно три части, каждая со своим заголовком с новой строки:",
  "«Что бросается в глаза», «Где сократить» (2–4 пункта с примерными суммами в месяц),",
  "«Долги» (в каком порядке гасить и почему).",
  "",
  "ВСЕ ЦИФРЫ УЖЕ ПОСЧИТАНЫ. Не складывай, не вычитай и не пересчитывай их сам —",
  "бери готовые значения из полей. Если нужной цифры нет — не придумывай её.",
  "",
  "Как читать данные:",
  "• «сегодня» — дата и сколько дней месяца прошло. Если месяц_только_начался —",
  "  прямо скажи, что данных пока мало, и сравнивай только с полем",
  "  «за_те_же_дни_прошлого_месяца», а не со всем прошлым месяцем.",
  "• «до_конца_месяца» — то же, что человек видит на главном экране. В первой части",
  "  обязательно назови «можно_тратить_в_день», а если хватает_на_обязательные = false —",
  "  сумму «не_хватает» и какие платежи впереди.",
  "• «каждый_месяц» — регулярные платежи. Если отмечено_оплаченным_вручную = true,",
  "  платёж оплачен, даже если оплачено_тратами = 0. Не советуй его оплатить.",
  "• «прогноз_переменных_трат_на_весь_месяц» — если тратить в том же темпе.",
  "",
  "Четыре РАЗНЫХ вида денег, не путай их:",
  "• «кошельки» — наличные и карты, свободные деньги;",
  "• «накопления» — вклады и копилки, к свободным деньгам их не приплюсовывай;",
  "  если ставка вклада ниже ставки долга — скажи об этом;",
  "• «я_должен» — обязательство, не актив и не доход;",
  "• «мне_должны» — пока не вернули, на эти деньги рассчитывать нельзя.",
  "",
  "Долги: первым советуй гасить долг с самой высокой ставкой_годовых;",
  "если есть «переплата_процентами_до_конца» — назови её. Без ставки не выдумывай её.",
  "Если долгов нет — в части «Долги» одной фразой скажи, что их нет.",
  "Без markdown-таблиц.",
].join("\n");

const ASK =
  "Разбери эти цифры. Ответ — на русском языке, начни сразу с заголовка «Что бросается в глаза».";

/** Первый заголовок заданной структуры: по нему отличаем ответ от черновика. */
const HEADING = /^\s*(?:\d[).]\s*)?(?:\*\*)?\s*Что бросается в глаза/im;

const INSIST =
  "Ответ был не на русском. Напиши разбор заново полностью на русском языке, " +
  "без единого английского предложения, без описания своих рассуждений. " +
  "Начни с заголовка «Что бросается в глаза».";

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  // Переспрос по-русски — та же ручка с флагом: человек жмёт кнопку сам,
  // вместо молчаливой второй попытки, которая удваивала ожидание.
  const insist = params.get("insist") === "1";
  // Часовой пояс человека: сервер живёт в UTC, а «сегодня» и границы месяца
  // должны быть его, иначе в Казахстане до 5 утра шёл бы ещё вчерашний день.
  const tz = Number(params.get("tz"));
  const tzOffset = Number.isFinite(tz) && Math.abs(tz) <= 14 * 60 ? tz : 0;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  // Ключ общий на всё приложение — задаёт его администратор. Доступ
  // конкретного человека проверяет сама функция (access_ai), а ключ
  // приходит зашифрованным: расшифровать может только этот сервер.
  const { data: config, error: configError } = (await supabase
    .rpc("ai_config_for_analysis")
    .maybeSingle()) as { data: { api_key_enc: string | null; model: string } | null; error: { code?: string; message: string } | null };
  if (configError) {
    return NextResponse.json(
      {
        error:
          configError.code === "42501"
            ? "ИИ-разбор отключён администратором"
            : configError.message,
      },
      { status: configError.code === "42501" ? 403 : 500 },
    );
  }
  if (!config?.api_key_enc) {
    return NextResponse.json(
      { error: "Администратор ещё не подключил ИИ-разбор" },
      { status: 400 },
    );
  }
  const apiKey = decryptApiKey(config.api_key_enc);
  const configuredModel = config.model;

  // Дневной лимит обращений, чтобы один пользователь не выжег общий ключ.
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from("ai_usage")
    .select("calls")
    .eq("user_id", user.id)
    .eq("day", today)
    .maybeSingle();

  const used = usage?.calls ?? 0;
  if (used >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `На сегодня лимит анализов исчерпан (${DAILY_LIMIT})` },
      { status: 429 },
    );
  }

  // Данные собираем на сервере под RLS — клиент не может подменить чужие цифры.
  // С запасом в пару дней: границы месяца считаются по часовому поясу человека.
  const since = new Date(startOfMonth(-1).getTime() - 2 * 86_400_000).toISOString();
  const [profileRes, ratesRes, walletsRes, categoriesRes, balancesRes, txRes] =
    await Promise.all([
      supabase.from("profiles").select("base_currency").eq("id", user.id).single(),
      supabase.from("exchange_rates").select("code, rate_to_base"),
      supabase
        .from("wallets")
        .select(
          "id, kind, name, currency, due_date, monthly_payment, is_recurring, recurring_day, rate, goal, term_end, amortization_method",
        )
        .eq("archived", false),
      supabase
        .from("categories")
        .select("id, kind, name, monthly_limit, parent_id, planned_amount, due_day, paid_month")
        .eq("archived", false),
      supabase.from("wallet_balances").select("wallet_id, currency, balance"),
      supabase
        .from("transactions")
        .select("type, amount, currency, category_id, subcategory_id, to_wallet_id, occurred_at")
        .gte("occurred_at", since),
    ]);

  const wallets = (walletsRes.data ?? []) as SummaryWallet[];
  const debtIds = wallets.filter((w) => w.kind === "debt_out").map((w) => w.id);
  const debtPaymentsRes = debtIds.length
    ? await supabase
        .from("transactions")
        .select("type, amount, currency, category_id, subcategory_id, to_wallet_id, occurred_at")
        .eq("type", "transfer")
        .in("to_wallet_id", debtIds)
    : { data: [] };

  const base = profileRes.data?.base_currency ?? "KZT";
  const rates = ratesRes.data ?? [];
  const toBase = (amount: number, currency: string) => {
    if (currency === base) return amount;
    const rate = (code: string) =>
      Number(rates.find((r) => r.code === code)?.rate_to_base ?? 1);
    return (amount * rate(currency)) / (rate(base) || 1);
  };
  const balances = balancesRes.data ?? [];

  // Четыре вида денег — отдельными списками, а все суммы и сравнения
  // посчитаны заранее: модель путала кошельки с долгами и ошибалась в
  // арифметике. Подробности — в buildAnalysisSummary.
  const summary = buildAnalysisSummary({
    now: new Date(),
    tzOffset,
    base,
    toBase,
    wallets,
    categories: (categoriesRes.data ?? []) as SummaryCategory[],
    balanceOf: (id) => Number(balances.find((b) => b.wallet_id === id)?.balance ?? 0),
    transactions: (txRes.data ?? []) as SummaryTx[],
    debtPayments: (debtPaymentsRes.data ?? []) as SummaryTx[],
  });

  const model = configuredModel || DEFAULT_MODEL;

  // Таймаут только на ожидание первого байта ответа: OpenRouter иногда
  // принимает запрос и потом долго молчит перед тем, как вообще начать
  // отвечать. Как только заголовки пришли — снимаем, чтобы не оборвать
  // сам поток, который может честно идти дольше (см. отдельную защиту
  // от зависания в relay() ниже).
  const connectController = new AbortController();
  const connectTimeout = setTimeout(() => connectController.abort(), 15_000);

  const ask = () =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: connectController.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost",
        "X-Title": "Dots",
      },
      body: JSON.stringify({
        model,
        // Ответ идёт человеку по мере написания. Ждать полминуты, глядя на
        // «Думает…», куда хуже, чем видеть, как строчки появляются.
        stream: true,
        // Рассуждающие модели отдельно «думают» перед ответом, и этот
        // черновик на английском вылезал прямо в разбор. Просим OpenRouter
        // не присылать его — модель думает, человек видит только вывод.
        // Размышления при этом всё равно съедают лимит токенов, поэтому и
        // просим думать покороче: задача несложная.
        reasoning: { effort: "low", exclude: true },
        // Свободы фантазии тут не нужно: разговор про конкретные суммы.
        temperature: 0.2,
        // Запаса хватает и на размышления, и на сам ответ: при 900 разбор
        // обрывался на середине.
        max_tokens: 2000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(summary) },
          // Требование языка идёт последним: небольшие модели тянутся к
          // языку последнего сообщения, а не системного.
          { role: "user", content: insist ? INSIST : ASK },
        ],
      }),
    });

  let response: Response;
  try {
    response = await ask();
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: timedOut ? "OpenRouter не ответил вовремя — попробуйте другую модель" : "OpenRouter недоступен" },
      { status: 502 },
    );
  } finally {
    clearTimeout(connectTimeout);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { error: "OpenRouter не принял ключ — сообщите администратору" },
        { status: 400 },
      );
    }
    if (response.status === 402) {
      return NextResponse.json(
        { error: "На счету OpenRouter не хватает средств для этой модели" },
        { status: 400 },
      );
    }
    // 404 у OpenRouter означает не «сервис пропал», а «нет такой модели»:
    // идентификаторы меняются, и выбранная когда-то модель может исчезнуть.
    if (response.status === 404) {
      return NextResponse.json(
        { error: `Модели «${model}» больше нет у OpenRouter — администратору нужно выбрать другую` },
        { status: 400 },
      );
    }
    if (response.status === 429) {
      return NextResponse.json(
        { error: "Слишком часто — бесплатные модели ограничены. Попробуйте через минуту" },
        { status: 400 },
      );
    }
    const detail = await response.text();
    return NextResponse.json(
      { error: `OpenRouter ответил ${response.status}`, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  // Считаем обращение сразу: ответ уже пошёл, и если человек закроет
  // страницу на середине, модель всё равно отработала.
  await supabase
    .from("ai_usage")
    .upsert({ user_id: user.id, day: today, calls: used + 1 }, { onConflict: "user_id,day" });

  return new Response(relay(response, model, DAILY_LIMIT - used - 1), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Без этого прокси копит ответ у себя, и вся затея с потоком теряет
      // смысл: человек снова ждёт молча до самого конца.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Переливает поток OpenRouter в поток для браузера.
 *
 * Наружу идут строки JSON: `chunk` — очередной кусок текста, `done` — итог
 * с оговорками. Начало придерживаем: пока не ясно, пошёл ответ или модель
 * ещё выкладывает черновик, показывать нечего.
 */
function relay(upstream: Response, model: string, callsLeft: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      let whole = "";  // весь ответ — по нему в конце судим о языке
      let head = "";   // придержанное начало, пока ищем заголовок
      let started = false;
      let cut = false;
      let rest = "";   // недочитанный хвост строки из потока

      const take = (piece: string) => {
        whole += piece;
        if (started) {
          send({ t: "chunk", v: piece });
          return;
        }
        head += piece;
        // Заголовок нашёлся — черновик кончился, начался ответ. Не нашёлся
        // за девять сотен знаков — значит его и не будет, ждать нечего.
        if (HEADING.test(head) || head.length > 900) {
          started = true;
          const ready = clean(head);
          if (ready) send({ t: "chunk", v: ready });
        }
      };

      try {
        const reader = upstream.body?.getReader();
        if (!reader) throw new Error("нет потока");

        for (;;) {
          // OpenRouter иногда принимает запрос (response.ok) и потом молчит
          // на середине потока — без этой подстраховки чтение просто
          // зависало до убийства функции по maxDuration, и человек видел
          // вечное «Думает…» без единой ошибки на экране.
          const { done, value } = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("stall")), 20_000),
            ),
          ]);
          if (done) break;
          rest += decoder.decode(value, { stream: true });

          const lines = rest.split("\n");
          rest = lines.pop() ?? "";
          for (const line of lines) {
            const data = line.trim();
            if (!data.startsWith("data:")) continue;
            const body = data.slice(5).trim();
            if (!body || body === "[DONE]") continue;
            try {
              const parsed = JSON.parse(body) as {
                choices?: { delta?: { content?: string }; finish_reason?: string }[];
              };
              const choice = parsed.choices?.[0];
              if (choice?.finish_reason === "length") cut = true;
              const piece = choice?.delta?.content;
              if (piece) take(piece);
            } catch {
              // Служебные строки вроде «: OPENROUTER PROCESSING» — не наше дело.
            }
          }
        }

        // Весь ответ уместился в придержанное начало и наружу не выходил.
        if (!started) {
          const ready = clean(head);
          if (ready) send({ t: "chunk", v: ready });
        }

        const text = clean(whole);
        if (!text) {
          send({ t: "error", error: "Модель ничего не ответила" });
        } else {
          const foreign = !russian(text);
          send({
            t: "done",
            model,
            callsLeft,
            foreign,
            // Ответ оставляем на экране: даже неидеальный он полезнее
            // пустого места. Но говорим, что дело в модели.
            warning: foreign
              ? "Эта модель отвечает не по-русски"
              : cut
                ? "Модель не уложилась и оборвалась на полуслове — с другой моделью разбор выйдет целее"
                : null,
          });
        }
      } catch {
        send({ t: "error", error: "Связь с OpenRouter оборвалась на середине" });
      }
      controller.close();
    },
  });
}

/**
 * Убирает из ответа черновик модели.
 *
 * `reasoning: { exclude: true }` выручает не всех: часть моделей всё равно
 * выкладывает размышления в сам текст — то тегом <think>, то фразой
 * «Here's a thinking process». Человеку это читать незачем, поэтому режем
 * по первому русскому заголовку из заданной структуры: до него любые
 * англоязычные черновики, после — собственно разбор.
 *
 * Разметку тут не трогаем: в потоке звёздочки приходят по кускам, и пару
 * к открывающей можно не дождаться. Их снимает страница при показе.
 */
function clean(raw: string): string {
  let text = raw;

  // Закрытый тег: ответ — всё, что после последнего закрытия.
  const closed = text.lastIndexOf("</think>");
  if (closed >= 0) text = text.slice(closed + "</think>".length);
  text = text.replace(/<\/?(think|thinking|reasoning)>/gi, "");

  const start = text.search(HEADING);
  if (start > 0) text = text.slice(start);

  // Обрезаем только начало. Хвост трогать нельзя: придержанный кусок
  // отдаётся в поток первым, и съеденный на его конце перенос строки
  // склеил бы заголовок следующего раздела с предыдущей строкой.
  return text.replace(/^\s+/, "");
}

/** Ответ считаем русским, если кириллицы в нём заметно больше латиницы. */
function russian(text: string): boolean {
  const cyrillic = (text.match(/[а-яё]/gi) ?? []).length;
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  return cyrillic > latin;
}

function startOfMonth(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}
