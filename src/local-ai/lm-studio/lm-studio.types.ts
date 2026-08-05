/**
 * Типи OpenAI-сумісного протоколу LM Studio.
 *
 * LM Studio віддає /v1/chat/completions у форматі OpenAI, тому ці ж типи
 * підійдуть будь-якому іншому локальному раннеру (Ollama, vLLM, llama.cpp server) —
 * саме на це розраховано вимогу «легко замінити модель у майбутньому».
 */

export type ChatRole = 'system' | 'user' | 'assistant';

/** Мультимодальна частина повідомлення: qwen2.5-vl приймає зображення як data-URL. */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export interface ChatCompletionOptions {
  /** Перевизначити модель для конкретного виклику (дефолт — LM_STUDIO_MODEL). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Примусити модель відповісти JSON за схемою.
   * Саме цим ми замінюємо native tool calling: qwen2.5-vl ігнорує параметр `tools`,
   * але json_schema тримає надійно.
   */
  jsonSchema?: { name: string; schema: Record<string, any> };
  /** Таймаут конкретного виклику, мс (дефолт — LM_STUDIO_TIMEOUT_MS). */
  timeoutMs?: number;
}

export interface ChatCompletionResponse {
  choices: Array<{
    index: number;
    message: { role: string; content: string | null };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
}

/** Відповідь /api/v0/models — розширений формат LM Studio (є state і capabilities). */
export interface LmStudioModelInfo {
  id: string;
  type?: string;
  arch?: string;
  state?: 'loaded' | 'not-loaded';
  max_context_length?: number;
  loaded_context_length?: number;
  capabilities?: string[];
}
