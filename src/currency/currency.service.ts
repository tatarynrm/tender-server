import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { Pool } from 'pg';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

// Виконується щодня о 09:00
@Cron('0 0 9 * * *', {
  timeZone: 'Europe/Kyiv', // задаємо часовий пояс
})
async handleMorningRates() {
  this.logger.log('Fetching currency rates at 09:00...');
  await this.fetchCurrencyRates();
}

// Виконується щодня о 23:00
@Cron('0 0 23 * * *', {
  timeZone: 'Europe/Kyiv',
})
async handleEveningRates() {
  this.logger.log('Fetching currency rates at 23:00...');
  await this.fetchCurrencyRates();
}


  // 🔹 Основна логіка запиту курсів валют
  private async fetchCurrencyRates() {
    try {
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

      const url = `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json`;
      const { data } = await axios.get(url);

      this.logger.log(`Отримано ${data.length} курсів валют за ${dateStr}`);

      // Збереження в базу
      await this.saveRatesToDb(data);

      this.logger.log(`✅ Курс валют успішно збережено в базу`);
    } catch (error) {
      this.logger.error('Помилка при отриманні курсів валют', error.message);
    }
  }

  // 🔹 Збереження даних у PostgreSQL через Pool
  private async saveRatesToDb(data: any[]) {
    const pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: +process.env.POSTGRES_PORT!,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
    });
    console.log(data, 'DATA');

    try {
      const res = await pool.query(`CALL run($1, $2, $3, $4)`, [
        'valut_rate_set_by_array',
        {},
        JSON.stringify(data,null,2),
        {},
      ]);
      console.log(res.rows[0], 'RES');
    } catch (error) {
      this.logger.error('Помилка при збереженні курсів у БД', error.message);
    } finally {
      await pool.end();
    }
  }
}
