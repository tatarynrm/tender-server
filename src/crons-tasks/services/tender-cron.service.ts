import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from 'src/database/database.service';
import { TenderGateway } from 'src/tender/tender.gateway';

@Injectable()
export class TenderCronService {
  private readonly logger = new Logger(TenderCronService.name);

  constructor(private readonly databaseService: DatabaseService, private readonly tenderGateway:TenderGateway) {}

  @Cron(CronExpression.EVERY_10_SECONDS, {
    name: 'tender_timer_job',
    timeZone: 'Europe/Kyiv',
  })
  async handleCron() {
    this.logger.debug('Починаємо роботу з оновленням часу тендеру');
    let client;

    try {
      client = await this.databaseService.getClient();
      let resultObject: any = {};

      const result = await client.query(`CALL tender_timer($1)`, [
        resultObject,
      ]);
      console.log(result.rows[0].res, 'RESULT UPDATE STATUS');

      if (result.rows && result.rows.length > 0) {
        // ✅ Замість console.log використовуй логер.
        // Winston запише цей об'єкт у файл application.log як JSON-поле.
        this.tenderGateway.emitToAll('tender_status_updated', result.rows[0]);
        this.logger.log('Дані з функції зміни отримано', {
          dbResult: result.rows[0],
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
