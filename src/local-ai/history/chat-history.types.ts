/** Токен провайдера — дозволяє підмінити сховище історії без правок LocalAiService. */
export const CHAT_HISTORY_STORE = Symbol('CHAT_HISTORY_STORE');

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** Який tool відпрацював на цьому кроці — показуємо у UI як джерело даних. */
  toolName?: string;
  /** Табличні дані від tool, щоб не перезапитувати їх при перезавантаженні сторінки. */
  rows?: any[];
  meta?: Record<string, any>;
}

export interface ChatSession {
  id: string;
  userId: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Сховище історії AI-чату.
 *
 * Реалізація на Redis (RedisChatHistoryStore) працює зараз. Коли зʼявляться
 * процедури в Postgres, додається друга реалізація під цим же інтерфейсом —
 * LocalAiService при цьому не змінюється.
 */
export interface ChatHistoryStore {
  createSession(userId: number, title: string): Promise<ChatSession>;
  getSession(userId: number, sessionId: string): Promise<ChatSession | null>;
  listSessions(userId: number): Promise<ChatSession[]>;
  renameSession(userId: number, sessionId: string, title: string): Promise<void>;
  deleteSession(userId: number, sessionId: string): Promise<void>;
  /** Видалити всі розмови користувача. Повертає, скільки видалено. */
  deleteAllSessions(userId: number): Promise<number>;
  /** Стеля розмов на користувача — UI показує її поруч із лічильником. */
  getMaxSessions(): number;

  appendMessage(
    userId: number,
    sessionId: string,
    message: Omit<StoredMessage, 'id' | 'createdAt'>,
  ): Promise<StoredMessage>;

  /** Повідомлення сесії у хронологічному порядку; limit обмежує «хвіст». */
  getMessages(
    userId: number,
    sessionId: string,
    limit?: number,
  ): Promise<StoredMessage[]>;
}
