/**
 * Выбор модели OpenRouter и перебор запасных.
 *
 * Авторежим (app_ai_config.auto): из живого списка OpenRouter берём только
 * бесплатные модели, подходящие под задачу: для текста — с большим окном и
 * без долгих размышлений, для фото — те, что видят картинки. Модель занята
 * (429), пропала (404) или лежит — пробуем следующую. Удачную запоминаем и
 * в следующий раз пробуем первой (пока сервер не перезапустился).
 *
 * Без авторежима — модель, выбранная админом, а для фото ещё и запасные.
 */
export type AiTask = "text" | "vision";

export interface AiConfig {
  api_key_enc: string | null;
  model: string | null;
  vision_model: string | null;
  auto: boolean;
}

interface OrModel {
  id: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  reasoning?: { default_enabled?: boolean } | null;
}

const DEFAULT_TEXT = "google/gemma-4-31b-it:free";
const DEFAULT_VISION = "google/gemma-4-31b-it:free";
const VISION_FALLBACK = ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-31b-it:free"];

/** Не для наших задач: охрана контента, код, эмбеддинги, звук. */
const NOT_FOR_US = /guard|safety|moderat|embed|rerank|tts|whisper|audio|speech|coder|codestral|-code\b|code:|math|ocr/i;
/** Семейства, которые хорошо пишут по-русски и держат JSON. */
const GOOD = /gemma|llama|qwen|mistral|deepseek|glm|gpt-oss|nemotron|kimi|hermes/i;

let catalog: { at: number; list: OrModel[] } | null = null;
const lastGood = new Map<AiTask, string>();

async function models(): Promise<OrModel[]> {
  if (catalog && Date.now() - catalog.at < 3600_000) return catalog.list;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { data?: OrModel[] };
    catalog = { at: Date.now(), list: data.data ?? [] };
  } catch {
    catalog ??= { at: 0, list: [] };
  }
  return catalog.list;
}

/** Бесплатные модели под задачу, лучшие первыми. */
export async function autoModels(task: AiTask, limit = 4): Promise<string[]> {
  const list = (await models()).filter((m) => {
    if (!m.id.endsWith(":free") || NOT_FOR_US.test(m.id)) return false;
    if ((m.context_length ?? 0) < 16000) return false;
    const sees = m.architecture?.input_modalities?.includes("image") ?? false;
    return task === "vision" ? sees : true;
  });
  const score = (m: OrModel) =>
    (GOOD.test(m.id) ? 3 : 0) +
    // Рассуждающие отвечают в разы дольше — для коротких задач хуже.
    (m.reasoning && m.reasoning.default_enabled !== false ? -2 : 0) +
    Math.min(2, (m.context_length ?? 0) / 64000);
  const ranked = list.sort((a, b) => score(b) - score(a)).map((m) => m.id);
  const fallback = task === "vision" ? VISION_FALLBACK : [DEFAULT_TEXT];
  const out = [...new Set([lastGood.get(task), ...ranked, ...fallback].filter((x): x is string => !!x))];
  return out.slice(0, limit);
}

/** Какие модели пробовать и в каком порядке. */
export async function modelsFor(task: AiTask, config: AiConfig): Promise<string[]> {
  if (config.auto) return autoModels(task);
  if (task === "vision") return [...new Set([config.vision_model || DEFAULT_VISION, ...VISION_FALLBACK])];
  return [config.model || DEFAULT_TEXT];
}

export interface AskResult {
  response: Response | null;
  model: string;
  status: number;
  failure: string;
}

/**
 * Спросить OpenRouter, перебирая модели. Таймаут — только на ожидание
 * заголовков ответа: поток (stream) потом может идти дольше.
 */
export async function askOpenRouter({
  task,
  apiKey,
  models: list,
  body,
  perTryMs = 30_000,
  totalMs = 52_000,
}: {
  task: AiTask;
  apiKey: string;
  models: string[];
  body: Record<string, unknown>;
  perTryMs?: number;
  totalMs?: number;
}): Promise<AskResult> {
  const deadline = Date.now() + totalMs;
  let status = 0;
  let failure = "";
  let model = list[0] ?? DEFAULT_TEXT;
  for (const m of list) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    model = m;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(left, perTryMs));
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost",
          "X-Title": "Dots",
        },
        body: JSON.stringify({ ...body, model: m }),
      });
      clearTimeout(timer);
      if (res.ok) {
        lastGood.set(task, m);
        return { response: res, model: m, status: 200, failure: "" };
      }
      status = res.status;
      failure = await res.text().catch(() => "");
      if (lastGood.get(task) === m) lastGood.delete(task);
      // Ключ или деньги — другая модель не поможет.
      if (status === 401 || status === 402 || status === 403) break;
    } catch (error) {
      clearTimeout(timer);
      status = error instanceof Error && error.name === "AbortError" ? 408 : 503;
    }
  }
  return { response: null, model, status, failure };
}

/** Закончился дневной лимит бесплатных запросов на ключ. */
export const outOfFreeDaily = (failure: string) => /free-models-per-day|per-day/i.test(failure);
