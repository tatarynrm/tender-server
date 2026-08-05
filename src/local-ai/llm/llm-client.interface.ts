import {
  ChatCompletionOptions,
  ChatMessage,
  LlmHealth,
  LlmProvider,
} from './llm.types';

/**
 * DI-токен активного провайдера. Конкретний клас обирається у
 * [local-ai.module.ts](../local-ai.module.ts) за `LOCAL_AI_PROVIDER`,
 * тому сервіси залежать від інтерфейсу, а не від Gemini чи LM Studio.
 */
export const LLM_CLIENT = 'LLM_CLIENT';

/**
 * Мінімальний контракт мовної моделі, якого достатньо помічнику.
 *
 * Три речі: вільна відповідь текстом, відповідь строго за JSON-схемою
 * (нею ми замінюємо native tool calling) і стан для індикатора в UI.
 * Заміна провайдера — це новий клас із цими методами плюс рядок у модулі.
 */
export interface LlmClient {
  getProvider(): LlmProvider;

  getDefaultModel(): string;

  /** Звичайний чат-запит. Повертає текст відповіді моделі. */
  chat(
    messages: ChatMessage[],
    options?: ChatCompletionOptions,
  ): Promise<string>;

  /** Чат із гарантованою JSON-відповіддю за схемою. */
  chatJson<T>(
    messages: ChatMessage[],
    jsonSchema: { name: string; schema: Record<string, any> },
    options?: Omit<ChatCompletionOptions, 'jsonSchema'>,
  ): Promise<T>;

  /** Стан провайдера — для `GET /local-ai/health`. */
  health(): Promise<LlmHealth>;

  /**
   * Чи вміє модель native tool calling. Ми ним не користуємося (JSON-схема
   * працює на будь-якій моделі), але значення показуємо в health —
   * воно пояснює, чому маршрутизація йде саме через схему.
   */
  supportsNativeTools(model?: string): Promise<boolean>;
}
