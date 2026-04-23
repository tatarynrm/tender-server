import { Inject, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { TelegramGateway } from './telegram.gateway';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';

const ADMIN_ID = 282039969;

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

  public async checkIfUserExist(telegramId: number) {
    const result = await this.pool.query(
      `SELECT * FROM person_telegram WHERE telegram_id = $1`,
      [telegramId],
    );
    return result.rows[0];
  }

  async findByTelegramToken(token: string) {
    const result = await this.pool.query(
      `SELECT u.id as user_id, p.id as person_id, u.email, ut.token 
       FROM usr_token ut
       JOIN usr u ON ut.email = u.email
       LEFT JOIN person p ON u.email = p.email
       WHERE ut.token = $1 AND ut.token_type = 'TELEGRAM_CONNECT'`,
      [token],
    );
    
    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.person_id || row.user_id, // Пріоритет на person_id для Telegram-зв'язку
      email: row.email,
    };
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
  async sendMessageToUser(personId: number, message: string, providedTelegramId?: number) {
    try {
      let telegramId = providedTelegramId;
      
      if (!telegramId) {
        const result = await this.pool.query(
          `SELECT telegram_id FROM person_telegram WHERE id_person = $1`,
          [personId],
        );
        telegramId = result.rows[0]?.telegram_id;
      }

      if (telegramId) {
        await this.bot.telegram.sendMessage(telegramId, message, {
          parse_mode: 'HTML',
        });
        return true;
      }
      return false;
    } catch (err) {
      this.logger.error(`Failed to send TG message to person ${personId}: ${err.message}`);
      return false;
    }
  }

  async broadcastMessage(payload: { 
    message: string, 
    filter?: { 
      companyIds?: number[], 
      roles?: string[],
      onlyICT?: boolean 
    } 
  }) {
    const { message, filter } = payload;
    
    let query = `
      SELECT pt.telegram_id, p.id as person_id 
      FROM person_telegram pt
      JOIN person p ON pt.id_person = p.id
      JOIN usr u ON p.email = u.email
    `;
    
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.companyIds?.length) {
      params.push(filter.companyIds);
      conditions.push(`u.id_company = ANY($${params.length})`);
    }

    if (filter?.onlyICT) {
      conditions.push(`u.id_company = 1`);
    }

    if (conditions.length) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    const { rows } = await this.pool.query(query, params);
    
    let successCount = 0;
    let failCount = 0;

    // Send in batches to avoid rate limits (25 per sec is Telegram's recommended safe limit)
    for (const row of rows) {
      try {
        await this.bot.telegram.sendMessage(row.telegram_id, message, {
          parse_mode: 'HTML',
        });
        successCount++;
      } catch (err) {
        this.logger.error(`Broadcast failed for TG ${row.telegram_id}: ${err.message}`);
        failCount++;
      }
      
      // Small sleep to be safe
      if (successCount % 25 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return { total: rows.length, success: successCount, failed: failCount };
  }

  async getSubscriberStats() {
    const { rows } = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN u.id_company = 1 THEN 1 END) as ict_count,
        COUNT(CASE WHEN u.id_company != 1 THEN 1 END) as carrier_count
      FROM person_telegram pt
      JOIN person p ON pt.id_person = p.id
      JOIN usr u ON p.email = u.email
    `);
    return rows[0];
  }

  public isAdmin(telegramId: number): boolean {
    return telegramId === ADMIN_ID;
  }

  public async runDeploy(): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      // Виконуємо команду 'deploy' на сервері
      exec('deploy', (error, stdout, stderr) => {
        if (error) {
          this.logger.error(`❌ Deploy failed: ${error.message}`);
          return resolve({ success: false, output: error.message });
        }
        this.logger.log(`✅ Deploy finished successfully`);
        resolve({ success: true, output: stdout || stderr });
      });
    });
  }
}
