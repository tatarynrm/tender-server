import { Inject, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { TelegramGateway } from './telegram.gateway';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private readonly channelId: string;

  constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly telegramGateway: TelegramGateway,
    private readonly configService: ConfigService,
    @InjectBot() private readonly bot: Telegraf<any>,
  ) {
    this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID')!;
  }

  async onModuleInit() {
    await this.setupWebhookMode();
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

  public async checkIfUserExist(telegramId: number) {
    const result = await this.pool.query(
      `SELECT * FROM person_telegram WHERE telegram_id = $1`,
      [telegramId],
    );
    return result.rows[0];
  }

  async findByTelegramToken(token: string) {
    // Змінено: Використовуємо таблицю usr_token та об'єднуємо по email
    const result = await this.pool.query(
      `SELECT p.*, ut.token 
       FROM person p
       INNER JOIN usr_token ut ON p.email = ut.email
       WHERE ut.token = $1 AND ut.token_type = 'TELEGRAM_CONNECT'`,
      [token],
    );
    return result.rows[0];
  }

  async updateTelegramId(
    personId: number,
    telegramId: number,
    username: string,
    firstName: string,
  ) {
    await this.pool.query(
      `INSERT INTO person_telegram (id_person, telegram_id, username, first_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_person)
       DO UPDATE SET 
         telegram_id = EXCLUDED.telegram_id,
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name`,
      [personId, telegramId, username, firstName],
    );
  }

  async sendNewLoadToTelegramGroup(order: any) {
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

    const message = [
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
      .filter((line) => line !== '')
      .join('\n');

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
}
