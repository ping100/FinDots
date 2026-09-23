/**
 * Запасной список моделей OpenRouter.
 *
 * Основной список приложение берёт живьём у OpenRouter: идентификаторы там
 * меняются, и зашитый в код перечень протухает — именно так четыре
 * бесплатные модели однажды исчезли, а разбор бюджета стал отвечать «404».
 * Этот список нужен только на случай, когда список не удалось загрузить.
 */
export interface AiModel {
  id: string;
  label: string;
  free: boolean;
}

export const AI_MODELS: AiModel[] = [
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", free: true },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super", free: true },
  { id: "qwen/qwen3.8-27b:free", label: "Qwen3.8 27B", free: true },
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", free: false },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", free: false },
];

export const DEFAULT_MODEL = AI_MODELS[0].id;
