import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { RedisClientType } from 'redis';
import {
  ChatHistoryStore,
  ChatSession,
  MessagePage,
  MessagePageQuery,
  StoredMessage,
} from './chat-history.types';

/**
 * Історія AI-чату в Redis.
 *
 * Схему Postgres у цьому проєкті ми не змінюємо (її веде окремий розробник),
 * тому історія живе там само, де вже живуть сесії express-session — у Redis,
 * з таким же TTL. Коли зʼявляться процедури ai_session_*, поруч стане
 * друга реалізація ChatHistoryStore, а цей клас можна буде прибрати.
 *
 * Ключі:
 *   ai:sessions:{userId}          ZSET  sessionId -> updatedAt (для сортування списку)
 *   ai:session:{userId}:{id}      STRING JSON метаданих сесії
 *   ai:messages:{userId}:{id}     LIST   JSON повідомлень у хронологічному порядку
 */
@Injectable()
export class RedisChatHistoryStore implements ChatHistoryStore {
  private readonly logger = new Logger(RedisChatHistoryStore.name);

  /** Розмір сторінки історії, якщо клієнт не попросив свій. */
  private static readonly DEFAULT_PAGE = 30;

  private readonly ttlSeconds: number;
  private readonly maxMessages: number;
  private readonly maxSessions: number;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: RedisClientType,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = Number(
      this.configService.get<string>('LOCAL_AI_HISTORY_TTL_SECONDS') ??
        60 * 60 * 24 * 30,
    );
    this.maxMessages = Number(
      this.configService.get<string>('LOCAL_AI_HISTORY_MAX_MESSAGES') ?? 200,
    );
    // Відповіді з таблицями важать по кілька десятків кілобайт, а Redis тримає
    // все в памʼяті — тому розмов на користувача рівно стільки, скільки видно в UI
    this.maxSessions = Number(
      this.configService.get<string>('LOCAL_AI_MAX_SESSIONS') ?? 10,
    );
  }

  public getMaxSessions(): number {
    return this.maxSessions;
  }

  public async createSession(
    userId: number,
    title: string,
  ): Promise<ChatSession> {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: randomUUID(),
      userId,
      title: this.normalizeTitle(title),
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };

    await this.saveSession(session);
    // Нова розмова — привід прибрати найстаріші: інакше памʼять Redis росла б
    // рівно доти, доки користувач не видалить щось руками
    await this.trimOldSessions(userId);

    return session;
  }

  public async getSession(
    userId: number,
    sessionId: string,
  ): Promise<ChatSession | null> {
    const raw = await this.redis.get(this.sessionKey(userId, sessionId));
    return raw ? (JSON.parse(raw) as ChatSession) : null;
  }

  public async listSessions(userId: number): Promise<ChatSession[]> {
    // Разом зі списком прибираємо хвіст: у користувачів, які накопичили розмови
    // до появи ліміту, зайве інакше висіло б у Redis до кінця TTL
    await this.trimOldSessions(userId);

    // ZSET відсортований за updatedAt — свіжі сесії зверху
    const ids = await this.redis.zRange(
      this.indexKey(userId),
      0,
      this.maxSessions - 1,
      { REV: true },
    );
    if (!ids.length) return [];

    const raws = await Promise.all(
      ids.map((id) => this.redis.get(this.sessionKey(userId, id))),
    );

    const sessions: ChatSession[] = [];
    const orphans: string[] = [];

    raws.forEach((raw, i) => {
      if (raw) sessions.push(JSON.parse(raw) as ChatSession);
      // Метадані вижив TTL, а індекс лишився — прибираємо, щоб список не брехав
      else orphans.push(ids[i]);
    });

    if (orphans.length) {
      await this.redis.zRem(this.indexKey(userId), orphans);
    }

    return sessions;
  }

  public async renameSession(
    userId: number,
    sessionId: string,
    title: string,
  ): Promise<void> {
    const session = await this.requireSession(userId, sessionId);
    session.title = this.normalizeTitle(title);
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  }

  public async deleteSession(
    userId: number,
    sessionId: string,
  ): Promise<void> {
    await Promise.all([
      this.redis.del(this.sessionKey(userId, sessionId)),
      this.redis.del(this.messagesKey(userId, sessionId)),
      this.redis.zRem(this.indexKey(userId), sessionId),
    ]);
  }

  public async deleteAllSessions(userId: number): Promise<number> {
    const ids = await this.redis.zRange(this.indexKey(userId), 0, -1);
    if (!ids.length) return 0;

    await Promise.all(ids.map((id) => this.deleteSession(userId, id)));
    // Прибираємо з індексу саме прочитані id, а не весь ключ: між читанням і
    // видаленням користувач міг з іншої вкладки почати нову розмову, і del
    // сховав би її зі списку назавжди, лишивши дані висіти до кінця TTL
    await this.redis.zRem(this.indexKey(userId), ids);

    this.logger.log(`Користувач ${userId} видалив усі розмови: ${ids.length}`);
    return ids.length;
  }

  /**
   * Тримати не більше maxSessions розмов: найстаріші за updatedAt видаляються
   * повністю — разом із повідомленнями, бо саме вони й важать у памʼяті.
   */
  private async trimOldSessions(userId: number): Promise<number> {
    const total = await this.redis.zCard(this.indexKey(userId));
    if (total <= this.maxSessions) return 0;

    // Без REV — на початку діапазону найменший score, тобто найдавніше оновлені
    const stale = await this.redis.zRange(
      this.indexKey(userId),
      0,
      total - this.maxSessions - 1,
    );

    await Promise.all(stale.map((id) => this.deleteSession(userId, id)));

    this.logger.log(
      `Користувач ${userId}: прибрано ${stale.length} старих розмов (ліміт ${this.maxSessions})`,
    );
    return stale.length;
  }

  public async appendMessage(
    userId: number,
    sessionId: string,
    message: Omit<StoredMessage, 'id' | 'createdAt'>,
  ): Promise<StoredMessage> {
    const session = await this.requireSession(userId, sessionId);

    const stored: StoredMessage = {
      ...message,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    const key = this.messagesKey(userId, sessionId);
    await this.redis.rPush(key, JSON.stringify(stored));
    // Тримаємо лише хвіст — стара переписка не потрібна ні моделі, ні UI
    await this.redis.lTrim(key, -this.maxMessages, -1);
    await this.redis.expire(key, this.ttlSeconds);

    session.messageCount += 1;
    session.updatedAt = stored.createdAt;
    // Перше повідомлення користувача дає осмислену назву сесії замість «Нова розмова»
    if (message.role === 'user' && session.messageCount === 1) {
      session.title = this.normalizeTitle(message.content);
    }
    await this.saveSession(session);

    return stored;
  }

  /**
   * Вікно повідомлень від кінця розмови.
   *
   * Повідомлення лежать у LIST у хронологічному порядку, тому сторінка — це
   * звичайний зріз за індексами: `offset` відлічується від найновішого.
   * Так фронт бере спершу хвіст розмови, а потім довантажує старіше вгору,
   * не тягнучи всю історію з таблицями даних одним запитом.
   */
  public async getMessages(
    userId: number,
    sessionId: string,
    query: MessagePageQuery = {},
  ): Promise<MessagePage> {
    const key = this.messagesKey(userId, sessionId);
    const total = await this.redis.lLen(key);

    const limit = Math.max(1, query.limit ?? RedisChatHistoryStore.DEFAULT_PAGE);
    const offset = Math.max(0, query.offset ?? 0);

    const stop = total - offset - 1;
    if (total === 0 || stop < 0) {
      return { messages: [], total, hasMore: false };
    }

    const start = Math.max(stop - limit + 1, 0);
    const raws = await this.redis.lRange(key, start, stop);

    const messages = raws
      .map((raw) => {
        try {
          return JSON.parse(raw) as StoredMessage;
        } catch {
          this.logger.warn(`Пошкоджене повідомлення в ${key}`);
          return null;
        }
      })
      .filter((m): m is StoredMessage => m !== null);

    return { messages, total, hasMore: start > 0 };
  }

  private async requireSession(
    userId: number,
    sessionId: string,
  ): Promise<ChatSession> {
    const session = await this.getSession(userId, sessionId);
    if (!session) {
      throw new NotFoundException('Сесію чату не знайдено або вона застаріла');
    }
    return session;
  }

  private async saveSession(session: ChatSession): Promise<void> {
    await this.redis.set(
      this.sessionKey(session.userId, session.id),
      JSON.stringify(session),
      { EX: this.ttlSeconds },
    );
    await this.redis.zAdd(this.indexKey(session.userId), {
      score: new Date(session.updatedAt).getTime(),
      value: session.id,
    });
    await this.redis.expire(this.indexKey(session.userId), this.ttlSeconds);
  }

  private normalizeTitle(title: string): string {
    const clean = (title ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'Нова розмова';
    return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
  }

  private indexKey = (userId: number) => `ai:sessions:${userId}`;
  private sessionKey = (userId: number, id: string) =>
    `ai:session:${userId}:${id}`;
  private messagesKey = (userId: number, id: string) =>
    `ai:messages:${userId}:${id}`;
}
