import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { RedisClientType } from 'redis';
import type { Socket } from 'socket.io';

/**
 * Розпізнана сесія сокета. `ict` — це `role.is_ict` користувача, який
 * express-session кладе в сесію при логіні (auth.service.ts:157). Саме за ним
 * розділяємо канали «наші менеджери ICT» ↔ «перевізники».
 */
export interface ISocketSession {
  userId: string;
  ict: boolean;
}

/**
 * Дістає й перевіряє сесію `centrifuge` прямо з рукостискання сокета, читаючи
 * той самий Redis-store, що й express-session. Дозволяє довіряти userId/ролі,
 * а не значенню, яке клієнт сам поклав у handshake.
 *
 * Реалізовано без зовнішніх залежностей (cookie-signature) — підпис куки
 * перевіряється вбудованим crypto, щоб не тягнути транзитивні пакети.
 */
@Injectable()
export class SocketSessionService {
  private readonly logger = new Logger(SocketSessionService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
    private readonly config: ConfigService,
  ) {}

  async resolve(socket: Socket): Promise<ISocketSession | null> {
    try {
      const cookieHeader = socket.handshake.headers?.cookie;
      if (!cookieHeader) return null;

      const cookieName =
        this.config.get<string>('SESSION_NAME') || 'centrifuge';
      const raw = this.readCookie(cookieHeader, cookieName);
      if (!raw) return null;

      // express-session зберігає значення у форматі "s:<sid>.<signature>".
      if (!raw.startsWith('s:')) return null;

      const secret = this.config.get<string>('SESSION_SECRET');
      if (!secret) return null;

      const sid = this.unsign(raw.slice(2), secret);
      if (!sid) return null;

      const prefix = this.config.get<string>('SESSION_FOLDER') || '';
      const data = await this.redisClient.get(`${prefix}${sid}`);
      if (!data) return null;

      const session = JSON.parse(data);
      const userId = session?.userId;
      if (userId === undefined || userId === null) return null;

      return { userId: String(userId), ict: !!session?.ict };
    } catch (err) {
      this.logger.warn(
        `Не вдалося розпізнати сесію сокета: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private readCookie(header: string, name: string): string | null {
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      if (part.slice(0, idx).trim() === name) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return null;
  }

  /** Аналог cookie-signature.unsign: повертає sid або null, якщо підпис невірний. */
  private unsign(input: string, secret: string): string | null {
    const idx = input.lastIndexOf('.');
    if (idx === -1) return null;

    const value = input.slice(0, idx);
    const provided = input.slice(idx + 1);
    const expected = createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    return timingSafeEqual(a, b) ? value : null;
  }
}
