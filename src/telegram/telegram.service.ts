import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { UserService } from '../user/user.service';
import { Pool } from 'pg';
import { TelegramGateway } from './telegram.gateway';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';

@Injectable()
export class TelegramService implements OnModuleInit {
  constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly telegramGateway: TelegramGateway,

    @InjectBot() private readonly bot: Telegraf<any>,
  ) {}
  async onModuleInit() {
    // Задаємо команди при старті
    // await this.setCommands();
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
}
