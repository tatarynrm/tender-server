import { Global, Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { UserService } from '../user/user.service';
import { Pool } from 'pg';
import { TelegramGateway } from './telegram.gateway';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService implements OnModuleInit {
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
    // Задаємо команди при старті
    // await this.setCommands();
    // await this.setupWebhook();
  }
  private async setupWebhook() {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProd) return;

    const domain = this.configService.get<string>('TELEGRAM_WEBHOOK_DOMAIN');
    const webhookUrl = `${domain}/telegram/telegram-webhook`;

    try {
      // 1. Отримуємо поточний стан вебхука
      const webhookInfo = await this.bot.telegram.getWebhookInfo();

      // 2. Якщо URL вже такий самий — нічого не робимо
      if (webhookInfo.url === webhookUrl) {
        console.log('✅ Webhook вже налаштований вірно. Пропускаємо.');
        return;
      }

      // 3. Якщо URL інший — оновлюємо
      await this.bot.telegram.setWebhook(webhookUrl);
      console.log(`🚀 Webhook оновлено на: ${webhookUrl}`);
    } catch (error) {
      if (error.response?.error_code === 429) {
        console.warn(
          '⚠️ Telegram Rate Limit: зачекайте хвилину перед наступною спробою.',
        );
      } else {
        console.error('❌ Помилка реєстрації Webhook:', error);
      }
    }
  }
  // async setCommands() {
  //   await this.bot.telegram.setMyCommands([
  //     { command: 'start', description: '🚀 Запустити бота' },
  //     { command: 'help', description: '🆘 Допомога по командам' },
  //     { command: 'profile', description: '✅ Показати профіль' },
  //   ]);
  //   console.log('Команди телеграм бота встановлені! ✅✅✅');
  // }
  public async checkIfUserExist(telegramId: number) {
    const result = await this.pool.query(
      `SELECT * FROM usr_telegram WHERE telegram_id = $1`,
      [telegramId],
    );
    return result.rows[0];
  }

  async findByTelegramToken(token: string) {
    const result = await this.pool.query(
      `SELECT a.*,b.token FROM usr a
       left join usr_token b on a.email = b.email
      
      WHERE token = $1 and token_type = 'TELEGRAM_CONNECT'`,
      [token],
    );
    return result.rows[0];
  }

  // Оновити telegramId користувача
  async updateTelegramId(
    userId: number,
    telegramId: number,
    username: string,
    first_name: string,
  ) {
    await this.pool.query(
      `
      insert into usr_telegram (id_usr,telegram_id,username,first_name)
      values ($1,$2,$3,$4)
      on conflict (id_usr)
      do update set telegram_id = excluded.telegram_id
      `,

      [userId, telegramId, username, first_name],
    );

    // await this.telegramGateway.notifyTelegramConnected(Number(userId));
  }

  // async deleteTelegramToken(token: string) {
  //   await this.pool.query(`DELETE FROM usr_token WHERE token = $1`, [token]);
  //   await this.telegramGateway.notifyTelegramDisonnected(0);
  // }

  async sendNewLoadToTelegramGroup(order: any) {
    // 1. Формуємо повний маршрут (збираємо всі точки, якщо їх декілька)
    const formatRoute = (routes: any[]) =>
      routes
        .sort((a, b) => a.order_num - b.order_num) // сортуємо по черзі
        .map((r: any) => `*${r.city}* (${r.country || r.ids_country})`)
        .join(' ➡️ ');

    const fromRoute = formatRoute(order.crm_load_route_from);
    const toRoute = formatRoute(order.crm_load_route_to);

    // 2. Типи авто (красиві назви)
    const trailers = order.crm_load_trailer
      .map((t: any) => t.trailer_type_name || t.ids_trailer_type)
      .join(', ');

    // 3. Логіка ціни
    const priceDisplay = order.is_price_request
      ? 'Запит ціни 💰'
      : `*${order.price} ${order.ids_valut}*`;

    // 4. Формуємо текст повідомлення
    const message = [
      `👉 **${order.author || 'Користувач'}** додав нову заявку: ✅ \`${order.id}\``,
      `---`,
      `📍 **Звідки:** ${fromRoute}`,
      `🏁 **Куди:** ${toRoute}`,
      ``,
      `🚛 **Транспорт:** ${trailers}`,
      `🗓 **Дата завантаження:** ${order.date_load}`,
      `💵 **Ставка:** ${priceDisplay}`,
      ``,
      `📦 **Деталі:** ${order.is_collective ? 'Збірний вантаж' : 'Повна машина'} / ${order.transit_type || 'Регіональні'}`,
      order.load_info ? `ℹ️ **Інфо:** ${order.load_info}` : '',
      `---`,
      `🏢 **Замовник:** ${order.company_name || 'Приватна особа'}`,
      `👤 **Автор:** ${order.author || 'ID ' + order.id_usr}`,
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
                url: `https://work.ict.lviv.ua/load/${order.id}`,
              },
            ],
          ],
        },
      });
    } catch (error) {
      console.error('Telegram Send Error:', error);
    }
  }
}
