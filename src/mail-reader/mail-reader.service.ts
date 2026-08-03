import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { RedisClientType } from 'redis';
import { AiService } from '../ai/ai.service';

export interface NewMailSummary {
  uid: number;
  from: string;
  fromAddress: string;
  subject: string;
  date: Date | null;
  preview: string;
  /** Довший фрагмент тексту для AI-класифікації (не для показу). */
  bodyText?: string;
}

export interface UnreadDigestItem {
  from: string;
  subject: string;
  date: Date | null;
  essence: string;
  importance: 'high' | 'medium' | 'low';
  category: string;
}

/**
 * Кастомний конектор до поштового сервера ICT по протоколу IMAP.
 * Замінює ідею з Gmail: підключаємось напряму до mail.ict.lviv.ua і читаємо
 * ЛИШЕ нові листи (по UID). Прочитаний/непрочитаний статус у скриньці НЕ чіпаємо —
 * дедуплікація тримається на останньому обробленому UID у Redis.
 */
@Injectable()
export class MailReaderService {
  private readonly logger = new Logger(MailReaderService.name);
  private readonly mailbox: string;

  constructor(
    private readonly config: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: RedisClientType,
    private readonly aiService: AiService,
  ) {
    this.mailbox = this.config.get<string>('ICT_IMAP_MAILBOX') || 'INBOX';
  }

  private uidKey(uidValidity: bigint | number) {
    return `mailreader:${this.mailbox}:${String(uidValidity)}:lastuid`;
  }

  private createClient(): ImapFlow {
    const host = this.config.get<string>('ICT_IMAP_HOST');
    const port = Number(this.config.get<number>('ICT_IMAP_PORT')) || 993;
    const user = this.config.get<string>('ICT_IMAP_LOGIN');
    const pass = this.config.get<string>('ICT_IMAP_PASSWORD');

    return new ImapFlow({
      host: host!,
      port,
      secure: true, // IMAP over SSL (993)
      auth: { user: user!, pass: pass! },
      logger: false, // не засмічуємо консоль внутрішніми логами imapflow
      tls: { rejectUnauthorized: false }, // як і в SMTP-конфізі проєкту
    });
  }

  /**
   * Підключається, забирає нові листи (UID > збереженого), оновлює курсор у Redis
   * і повертає короткі зведення для сповіщення. При першому запуску курсор
   * встановлюється на поточний максимум — старі листи НЕ спамимо.
   */
  async fetchNewMail(): Promise<NewMailSummary[]> {
    const client = this.createClient();
    const results: NewMailSummary[] = [];

    try {
      await client.connect();
    } catch (err: any) {
      this.logger.error(`❌ IMAP-підключення не вдалося: ${err.message}`);
      throw err;
    }

    const lock = await client.getMailboxLock(this.mailbox);
    try {
      const mailbox: any = client.mailbox;
      const uidValidity = mailbox?.uidValidity ?? 0;
      const uidNext: number = Number(mailbox?.uidNext ?? 1);
      const key = this.uidKey(uidValidity);

      const stored = await this.redis.get(key);

      // Перший запуск для цього uidValidity — виставляємо базову лінію на "зараз".
      if (stored === null) {
        const baseline = Math.max(0, uidNext - 1);
        await this.redis.set(key, String(baseline));
        this.logger.log(
          `🆕 Базову лінію IMAP встановлено (uid=${baseline}). Сповіщатимемо лише про нові листи.`,
        );
        return [];
      }

      const lastUid = Number(stored);
      if (uidNext - 1 <= lastUid) {
        return []; // нових листів немає
      }

      let maxSeen = lastUid;

      // `${lastUid + 1}:*` у UID-режимі за специфікою IMAP завжди повертає
      // щонайменше останній лист — тому додатково фільтруємо uid > lastUid.
      for await (const msg of client.fetch(
        `${lastUid + 1}:*`,
        { uid: true, envelope: true, source: true, internalDate: true },
        { uid: true },
      )) {
        const uid = Number(msg.uid);
        if (uid <= lastUid) continue;
        if (uid > maxSeen) maxSeen = uid;

        const env: any = msg.envelope || {};
        const fromObj = Array.isArray(env.from) && env.from[0] ? env.from[0] : {};
        const fromName: string = fromObj.name || '';
        const fromAddress: string = fromObj.address || '';
        const subject: string = env.subject || '(без теми)';
        const date: Date | null = env.date || msg.internalDate || null;

        let preview = '';
        try {
          if (msg.source) {
            const parsed = await simpleParser(msg.source);
            preview = (parsed.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
          }
        } catch (parseErr: any) {
          this.logger.warn(`Не вдалося розпарсити тіло листа uid=${uid}: ${parseErr.message}`);
        }

        results.push({
          uid,
          from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
          fromAddress,
          subject,
          date,
          preview,
        });
      }

      if (maxSeen > lastUid) {
        await this.redis.set(key, String(maxSeen));
      }

      if (results.length > 0) {
        this.logger.log(`📬 Отримано нових листів: ${results.length}`);
      }
    } finally {
      lock.release();
      try {
        await client.logout();
      } catch {
        /* ignore logout errors */
      }
    }

    // Від найстарішого до найновішого
    return results.sort((a, b) => a.uid - b.uid);
  }

  /**
   * Читає НЕПРОЧИТАНІ листи (UNSEEN) у режимі read-only — статус "непрочитано"
   * у скриньці НЕ змінюється. Повертає до `limit` найсвіжіших листів.
   * НЕ чіпає Redis-курсор (це разовий запит на вимогу, а не фонова перевірка).
   */
  async fetchUnreadMail(limit = 15): Promise<NewMailSummary[]> {
    const client = this.createClient();
    const results: NewMailSummary[] = [];

    await client.connect();
    // readOnly: true — сервер відкриває скриньку через EXAMINE, тож fetch тіла
    // не виставляє прапорець \Seen.
    const lock = await client.getMailboxLock(this.mailbox, { readOnly: true });
    try {
      let uids = (await client.search({ seen: false }, { uid: true })) || [];
      if (!uids.length) return [];

      // Беремо лише останні `limit` (найбільші UID = найсвіжіші).
      uids = uids.sort((a, b) => a - b).slice(-limit);

      for await (const msg of client.fetch(
        uids,
        { uid: true, envelope: true, source: true, internalDate: true },
        { uid: true },
      )) {
        const env: any = msg.envelope || {};
        const fromObj = Array.isArray(env.from) && env.from[0] ? env.from[0] : {};
        const fromName: string = fromObj.name || '';
        const fromAddress: string = fromObj.address || '';

        let text = '';
        try {
          if (msg.source) {
            const parsed = await simpleParser(msg.source);
            text = (parsed.text || '').replace(/\s+/g, ' ').trim();
          }
        } catch {
          /* ігноруємо помилки парсингу окремого листа */
        }

        results.push({
          uid: Number(msg.uid),
          from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
          fromAddress,
          subject: env.subject || '(без теми)',
          date: env.date || msg.internalDate || null,
          preview: text.slice(0, 300),
          bodyText: text.slice(0, 1500),
        });
      }
    } finally {
      lock.release();
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }

    // Найсвіжіші зверху
    return results.sort((a, b) => b.uid - a.uid);
  }

  /**
   * Дайджест непрочитаних: суть кожного листа + важливість (через AI),
   * відсортовано від найважливіших до найменш важливих.
   */
  async getUnreadDigest(limit = 15): Promise<UnreadDigestItem[]> {
    const mails = await this.fetchUnreadMail(limit);
    if (!mails.length) return [];

    const classified = await this.aiService.classifyEmails(
      mails.map((m) => ({
        from: m.from,
        subject: m.subject,
        body: m.bodyText || m.preview,
      })),
    );

    const byIndex = new Map(classified.map((c) => [c.index, c]));

    const items: UnreadDigestItem[] = mails.map((m, i) => {
      const c = byIndex.get(i);
      return {
        from: m.from,
        subject: m.subject,
        date: m.date,
        essence: c?.essence || m.preview.slice(0, 120) || '(порожній лист)',
        importance: c?.importance || 'medium',
        category: c?.category || '—',
      };
    });

    const rank: Record<UnreadDigestItem['importance'], number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    return items.sort((a, b) => rank[a.importance] - rank[b.importance]);
  }
}
