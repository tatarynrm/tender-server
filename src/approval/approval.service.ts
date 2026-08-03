import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Markup } from 'telegraf';
import type { RedisClientType } from 'redis';
import { randomBytes } from 'crypto';

export type ApprovalStatus = 'pending' | 'confirming' | 'approved' | 'denied';

export interface ApprovalRecord {
  id: string;
  status: ApprovalStatus;
  tool: string;
  summary: string;
  detail: string;
  createdAt: number;
  messageId?: number;
}

/** Скільки живе запит. Далі Redis сам його прибирає, а хук отримає 404 і впаде в ask. */
const TTL_SECONDS = 900;

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: RedisClientType,
    @InjectBot() private readonly bot: Telegraf<any>,
  ) {}

  private key(id: string) {
    return `approval:${id}`;
  }

  private adminId(): number {
    return Number(this.configService.get<string>('TELEGRAM_ADMIN_ID'));
  }

  private async save(rec: ApprovalRecord) {
    await this.redis.set(this.key(rec.id), JSON.stringify(rec), {
      EX: TTL_SECONDS,
    });
  }

  async get(id: string): Promise<ApprovalRecord | null> {
    const raw = await this.redis.get(this.key(id));
    return raw ? (JSON.parse(raw) as ApprovalRecord) : null;
  }

  /** Створює запит і надсилає адміну повідомлення з кнопками. */
  async create(input: {
    tool: string;
    summary: string;
    detail: string;
  }): Promise<ApprovalRecord> {
    const id = randomBytes(8).toString('hex');
    const rec: ApprovalRecord = {
      id,
      status: 'pending',
      tool: input.tool,
      summary: input.summary,
      detail: input.detail,
      createdAt: Date.now(),
    };

    const text = [
      '🔐 Claude Code просить погодження',
      '',
      `Інструмент: ${rec.tool}`,
      `Дія: ${rec.summary}`,
      rec.detail ? '' : null,
      rec.detail ? rec.detail.slice(0, 1500) : null,
    ]
      .filter((l) => l !== null)
      .join('\n');

    const sent = await this.bot.telegram.sendMessage(this.adminId(), text, {
      link_preview_options: { is_disabled: true },
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Погодити', `apv:${id}:yes`),
          Markup.button.callback('⛔️ Заборонити', `apv:${id}:no`),
        ],
      ]),
    });

    rec.messageId = sent.message_id;
    await this.save(rec);
    this.logger.log(`Запит на погодження ${id}: ${rec.tool} / ${rec.summary}`);
    return rec;
  }

  /**
   * Перше натискання. Нічого не вирішує — лише переводить у стан підтвердження
   * і показує другу пару кнопок. Захист від випадкового тику по сповіщенню.
   */
  async firstPress(id: string, allow: boolean): Promise<ApprovalRecord | null> {
    const rec = await this.get(id);
    if (!rec || rec.status !== 'pending') return rec;

    if (!allow) {
      rec.status = 'denied';
      await this.save(rec);
      return rec;
    }

    rec.status = 'confirming';
    await this.save(rec);
    return rec;
  }

  /** Друге натискання — остаточне рішення. */
  async confirm(id: string, allow: boolean): Promise<ApprovalRecord | null> {
    const rec = await this.get(id);
    if (!rec || rec.status !== 'confirming') return rec;

    rec.status = allow ? 'approved' : 'denied';
    await this.save(rec);
    this.logger.log(`Погодження ${id}: ${rec.status}`);
    return rec;
  }
}
