import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DbEventsProcessor {
  private readonly logger = new Logger(DbEventsProcessor.name);

  constructor(@Inject('PG_POOL') private readonly pgPool: Pool) {}

  async processEvents(payload?: any) {
    this.logger.log(`Processing database events. Notification signal: ${JSON.stringify(payload) || 'empty'}`);

    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');

      // 1. Отримуємо список сповіщень через вашу процедуру
      const result = await client.query('SELECT notify_list()');
      const notifications = result.rows[0]?.notify_list;

      if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
        this.logger.debug('No pending notifications found in notify_list().');
        await client.query('COMMIT');
        return;
      }

      this.logger.log(`Found ${notifications.length} notifications to process.`);

      for (const item of notifications) {
        try {
          // 2. Виклик відповідної логіки для типу сповіщення
          // Враховуємо список отримувачів (item.id_person_list) та контент (item.content)
          await this.dispatch(item.ids_notify_type, item);

          // 3. Відмітка про завершення (можна викликати іншу процедуру або UPDATE)
          // Припускаємо, що у вас є таблиця для маркування або процедура mark_as_completed(id)
          await client.query('UPDATE sys_notifications SET status = $1, processed_at = NOW() WHERE id = $2', ['PROCESSED', item.id]);

        } catch (e) {
          this.logger.error(`Error processing notification ${item.id} (${item.ids_notify_type}): ${e.message}`);
          await client.query('UPDATE sys_notifications SET status = $1, error_message = $2 WHERE id = $3', ['ERROR', e.message, item.id]);
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      this.logger.error(`Batch processing failed: ${e.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Розподіл логіки за типами сповіщень
   */
  private async dispatch(notifyType: string, data: any) {
    const { id_person_list, content, id_tblref, tblref } = data;
    
    this.logger.log(`Dispatching notification type: ${notifyType} for table: ${tblref}`);

    switch (notifyType) {
      case 'TENDER_STATUS_CHANGED':
        // Логіка зміни статусу тендеру
        // Наприклад: сповістити всіх через сокети, що статус став 'ACTIVE'
        await this.handleTenderStatusChanged(id_tblref, content);
        break;
      
      case 'TENDER_ACTUAL':
        // Логіка для "Актуального тендеру" для конкретних людей
        // Тут використовуємо id_person_list
        await this.handleTenderActual(id_person_list, content);
        break;

      default:
        this.logger.warn(`No handler for notification type: ${notifyType}`);
    }
  }

  private async handleTenderStatusChanged(tenderId: number, content: any) {
      this.logger.log(`Tender ${tenderId} changed status to ${content.ids_status}`);
      // Тут викликаєте сервіс сокетів або пуш-нотифікацій для всіх
  }

  private async handleTenderActual(personIds: number[], content: any) {
      this.logger.log(`Tender Actual for users: ${personIds.join(', ')}`);
      // Тут викликаєте сервіс для відправки персональних повідомлень (Telegram/Email/Socket)
  }
}
