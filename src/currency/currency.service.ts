import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { Pool } from 'pg';

@Injectable()
export class CurrencyService implements OnModuleInit {
  private readonly logger = new Logger(CurrencyService.name);

  // 1. ВИКОНУЄТЬСЯ ПРИ СТАРТІ СЕРВЕРА
  async onModuleInit() {
    this.logger.log('🚀 Server started. Initial fetch of currency rates...');
    await this.fetchCurrencyRates();
  }

  // 2. НОВИЙ РОЗКЛАД: 07:50
  @Cron('0 50 7 * * *', {
    timeZone: 'Europe/Kyiv',
  })
  async handleMorningEarlyRates() {
    this.logger.log('Fetching currency rates at 07:50...');
    await this.fetchCurrencyRates();
  }

  // 3. НОВИЙ РОЗКЛАД: 18:00
  @Cron('0 0 18 * * *', {
    timeZone: 'Europe/Kyiv',
  })
  async handleEveningSevenRates() {
    this.logger.log('Fetching currency rates at 19:00...');
    await this.fetchCurrencyRates();
  }

  // --- Ваші існуючі крони ---

  @Cron('0 0 9 * * *', { timeZone: 'Europe/Kyiv' })
  async handleMorningRates() {
    await this.fetchCurrencyRates();
  }

  @Cron('0 0 23 * * *', { timeZone: 'Europe/Kyiv' })
  async handleEveningRates() {
    await this.fetchCurrencyRates();
  }

  // 🔹 Основна логіка запиту курсів валют
  private async fetchCurrencyRates() {
    try {
      const url = `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json`;
      const { data } = await axios.get(url);

      this.logger.log(`Отримано ${data.length} курсів валют`);

      await this.saveRatesToDb(data);
      this.logger.log(`✅ Курс валют успішно оброблено`);
    } catch (error) {
      this.logger.error('Помилка при отриманні курсів валют', error.message);
    }
  }

  // 🔹 Збереження даних у БД
  private async saveRatesToDb(data: any[]) {
    // Рекомендується винести конфігурацію пула в окремий сервіс або модуль,
    // щоб не створювати новий пул при кожному виклику!
    const pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: +process.env.POSTGRES_PORT!,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
    });

    try {
      const res = await pool.query(`CALL run($1, $2, $3, $4)`, [
        'valut_rate_set_by_array',
        {},
        JSON.stringify(data),
        {},
      ]);
      this.logger.log('DB Response processed');
    } catch (error) {
      this.logger.error('Помилка при збереженні курсів у БД', error.message);
    } finally {
      await pool.end();
    }
  }
}
