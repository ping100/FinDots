/**
 * Модели OpenRouter. Список — подсказка для настроек; поле остаётся
 * редактируемым, чтобы сменить модель без передеплоя, когда OpenRouter
 * переименует или уберёт идентификатор.
 */
export const AI_MODELS: { id: string; label: string; free: boolean }[] = [
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", free: true },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3", free: true },
  { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash", free: true },
  { id: "qwen/qwen-2.5-72b-instruct:free", label: "Qwen 2.5 72B", free: true },
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", free: false },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", free: false },
];
