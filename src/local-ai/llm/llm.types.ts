/**
 * Типи діалогу з LLM — спільні для всіх провайдерів.
 *
 * Формат навмисно OpenAI-подібний: він же рідний для LM Studio, а для Gemini
 * перекладається в його `contents` усередині GeminiClient. Решта модуля
 * (LocalAiService, SqlGeneratorService) знає лише ці типи й не здогадується,
 * яка саме модель відповідає.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

/** Мультимодальна частина повідомлення: зображення передається як data-URL. */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export interface ChatCompletionOptions {
  /** Перевизначити модель для конкретного виклику. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Примусити модель відповісти JSON за схемою.
   * Це наш замінник native tool calling: працює однаково і в Gemini
   * (responseSchema), і в LM Studio (response_format: json_schema).
   */
  jsonSchema?: { name: string; schema: Record<string, any> };
  /** Таймаут конкретного виклику, мс. */
  timeoutMs?: number;
}

/** Який саме провайдер обслуговує помічника. */
export type LlmProvider = 'gemini' | 'lmstudio';

/** Стан моделі для індикатора в UI. */
export interface LlmHealth {
  /** Провайдер відповідає (ключ заданий, сервіс досяжний). */
  available: boolean;
  provider: LlmProvider;
  model: string;
  /**
   * Модель готова приймати запити. Для локального раннера це «завантажена в
   * памʼять», для хмарного Gemini — «модель існує і ключ її бачить».
   */
  loaded: boolean;
  error?: string;
}
