/**
 * Типи OpenAI-сумісного протоколу LM Studio.
 *
 * Формат діалогу спільний для всіх провайдерів і живе в
 * [llm.types.ts](../llm/llm.types.ts) — тут лишилося тільки те, що специфічне
 * саме для локального раннера (сира відповідь і розширений список моделей).
 */

export type {
  ChatContentPart,
  ChatCompletionOptions,
  ChatMessage,
  ChatRole,
} from '../llm/llm.types';

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
