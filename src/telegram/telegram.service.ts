import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { TelegramRepository } from './telegram.repository';
import { TelegramGateway } from './telegram.gateway';

const ADMIN_ID = 282039969;

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private readonly channelId: string;

  constructor(
    private readonly repository: TelegramRepository,
    private readonly telegramGateway: TelegramGateway,
    private readonly configService: ConfigService,
    @InjectBot() private readonly bot: Telegraf<any>,
  ) {
    this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID')!;
  }

  async onModuleInit() {
    await this.setupWebhookMode();
    await this.setupBotCommands();
  }

  private async setupBotCommands() {
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Запустити / Перезапустити бота' },
        { command: 'info', description: 'Інформація про бота' },
      ]);
      this.logger.log('✅ Команди бота успішно встановлено');
    } catch (error) {
      this.logger.error('❌ Помилка при встановленні команд бота:', error);
    }
  }

  private async setupWebhookMode() {
    try {
      const domain = this.configService.get<string>('WEBHOOK_DOMAIN');
      if (!domain) {
        this.logger.warn(
          '⚠️ WEBHOOK_DOMAIN не задано. Бот може не отримувати оновлення.',
        );
        return;
      }

      const webhookUrl = `${domain}/telegram/webhook`;
      await this.bot.telegram.setWebhook(webhookUrl);
      this.logger.log(`✅ Webhook успішно встановлено на: ${webhookUrl}`);
    } catch (error) {
      this.logger.error('❌ Помилка при налаштуванні Webhook:', error);
    }
  }

  // --- Database Wrappers ---

  public async checkIfUserExist(telegramId: number) {
    return this.repository.findByTelegramId(telegramId);
  }

  async findByTelegramToken(token: string) {
    const row = await this.repository.findByToken(token);
    if (!row) return null;

    return {
      id: row.person_id || row.user_id,
      email: row.email,
    };
  }

  async updateTelegramId(
    personId: number,
    telegramId: number,
    username: string,
    firstName: string,
  ) {
    await this.repository.upsertTelegramUser({
      personId,
      telegramId,
      username,
      firstName,
    });
  }

  async getSubscriberStats() {
    return this.repository.getSubscriberStats();
  }

  async getTelegramUsers() {
    return this.repository.getAllTelegramUsers();
  }

  // --- Messaging ---

  async sendNewLoadToTelegramGroup(order: any) {
    const message = this.formatOrderMessage(order);

    try {
      await this.bot.telegram.sendMessage(this.channelId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚚 Відкрити заявку на порталі',
                url: `https://tender.ict.lviv.ua/log/load/active`,
              },
            ],
          ],
        },
      });
    } catch (error) {
      this.logger.error('Помилка відправки в групу:', error);
    }
  }

  async sendMessageToUser(
    personId: number,
    message: string,
    providedTelegramId?: number,
  ) {
    try {
      let telegramId = providedTelegramId;

      if (!telegramId) {
        const row = await this.repository.findByPersonId(personId);
        telegramId = row?.telegram_id;
      }

      if (telegramId) {
        await this.bot.telegram.sendMessage(telegramId, message, {
          parse_mode: 'HTML',
        });
        return true;
      }
      return false;
    } catch (err) {
      this.logger.error(
        `Failed to send TG message to person ${personId}: ${err.message}`,
      );
      return false;
    }
  }

  async broadcastMessage(payload: {
    message: string;
    filter?: { companyIds?: number[]; roles?: string[]; onlyICT?: boolean };
  }) {
    const rows = await this.repository.getSubscribersForBroadcast(
      payload.filter,
    );

    let successCount = 0;
    let failCount = 0;

    for (const row of rows) {
      try {
        await this.bot.telegram.sendMessage(row.telegram_id, payload.message, {
          parse_mode: 'HTML',
        });
        successCount++;
      } catch (err) {
        this.logger.error(
          `Broadcast failed for TG ${row.telegram_id}: ${err.message}`,
        );
        failCount++;
      }

      if (successCount % 25 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return { total: rows.length, success: successCount, failed: failCount };
  }

  async sendMeetingNotification(payload: {
    url: string;
    audienceType: 'all' | 'heads' | 'selective';
    targetIds?: number[];
  }) {
    let telegramIds: number[] = [];

    if (payload.targetIds && payload.targetIds.length > 0) {
      const rows = await this.repository.getSubscribersByUserIds(payload.targetIds);
      telegramIds = rows.map((r) => r.telegram_id);
    } else if (payload.audienceType === 'all') {
      const rows = await this.repository.getSubscribersForBroadcast({ onlyICT: true });
      telegramIds = rows.map((r) => r.telegram_id);
    }

    if (telegramIds.length === 0) return { total: 0, success: 0, failed: 0 };

    const message = `🎥 <b>Увага! Почалася нова відео-нарада!</b>\n\n` +
                    `Заходьте на портал або переходьте за прямим посиланням:\n` +
                    `<a href="${payload.url}">${payload.url}</a>\n\n` +
                    `<i>(Ви можете також натиснути червону кнопку "Відео-нарада" у шапці CRM, як показано на фото)</i>`;

    const path = require('path');
    const photoPath = path.resolve(process.cwd(), 'assets', 'meeting_button.png');

    let successCount = 0;
    let failCount = 0;

    for (const tgId of telegramIds) {
      try {
        await this.bot.telegram.sendPhoto(
          tgId,
          { source: photoPath },
          { caption: message, parse_mode: 'HTML' }
        );
        successCount++;
      } catch (err) {
        this.logger.error(`Failed to send meeting notification to TG ${tgId}: ${err.message}`);
        failCount++;
      }

      if (successCount % 20 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return { total: telegramIds.length, success: successCount, failed: failCount };
  }

  // --- Helpers ---

  private formatOrderMessage(order: any): string {
    const formatRoute = (routes: any[]) =>
      (routes || [])
        .sort((a, b) => a.order_num - b.order_num)
        .map((r: any) => `*${r.city}* (${r.country || r.ids_country})`)
        .join(' ➡️ ');

    const fromRoute = formatRoute(order.crm_load_route_from);
    const toRoute = formatRoute(order.crm_load_route_to);
    const trailers = (order.crm_load_trailer || [])
      .map((t: any) => t.trailer_type_name || t.ids_trailer_type)
      .join(', ');
    const priceDisplay = order.is_price_request
      ? 'Запит ціни 💰'
      : `*${order.price} ${order.ids_valut}*`;

    return [
      `👉 *${order.author || 'Користувач'}* додав нову заявку: ✅ \`${order.id}\``,
      `---`,
      `📍 *Звідки:* ${fromRoute}`,
      `🏁 *Куди:* ${toRoute}`,
      ``,
      `🚛 *Транспорт:* ${trailers}`,
      `🗓 *Дата завантаження:* ${order.date_load}`,
      `💵 *Ставка:* ${priceDisplay}`,
      ``,
      `📦 *Деталі:* ${order.is_collective ? 'Збірний вантаж' : 'Повна машина'} / ${order.transit_type || 'Регіональні'}`,
      order.load_info ? `ℹ️ *Інфо:* ${order.load_info}` : '',
      `---`,
      `🏢 *Замовник:* ${order.company_name || 'Приватна особа'}`,
      `👤 *Автор:* ${order.author || 'ID ' + order.id_usr}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  public isAdmin(telegramId: number): boolean {
    return telegramId === ADMIN_ID;
  }

  public async runDeploy(): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      // Використовуємо збільшений буфер (10MB), оскільки npm run build може видавати багато логів
      exec('bash /root/deploy.sh', { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
          this.logger.error(`❌ Deploy failed: ${error.message}`);
          return resolve({ success: false, output: error.message + '\n' + stderr });
        }
        this.logger.log(`✅ Deploy finished successfully`);
        resolve({ success: true, output: stdout || stderr });
      });
    });
  }
}
