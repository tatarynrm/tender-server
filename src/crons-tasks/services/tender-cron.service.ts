import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class TenderCronService {
  private readonly logger = new Logger(TenderCronService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'tender_timer_job',
    timeZone: 'Europe/Kyiv',
  })
  async handleCron() {
    this.logger.debug('Починаємо роботу з оновленням часу тендеру');
    let client;

    try {
      client = await this.databaseService.getClient();
      let resultObject: any = {};
      
      const result = await client.query(`CALL tender_timer($1)`, [resultObject]);

      if (result.rows && result.rows.length > 0) {
        // ✅ Замість console.log використовуй логер. 
        // Winston запише цей об'єкт у файл application.log як JSON-поле.
        this.logger.log('Дані з функції зміни отримано', { 
          dbResult: result.rows[0] 
        });
      }

      this.logger.debug('Роботу з оновленням часу тендеру закінчено.');
    } catch (error) {
      // ✅ Це автоматично піде в error.log
      this.logger.error('Помилка під час виконання крон-задачі', error.stack);
    } finally {
      if (client) {
        client.release();
        this.logger.debug('Клієнт БД успішно звільнений.');
      }
    }
  }
}