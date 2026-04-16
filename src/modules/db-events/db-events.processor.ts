import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class DbEventsProcessor {
  private readonly logger = new Logger(DbEventsProcessor.name);

  constructor(
    @Inject('PG_POOL') private readonly pgPool: Pool,
    @InjectQueue('tender_notifications') private readonly tenderQueue: Queue,
  ) {}

  async processEvents(payload?: any) {
    this.logger.log(
      `Processing database events dispatching to queue. Notification signal: ${JSON.stringify(payload) || 'empty'}`,
    );

    const client = await this.pgPool.connect();
    try {
      const result = await client.query('SELECT notify_list()');
      const notifications = result.rows[0]?.notify_list;

      if (
        !notifications ||
        !Array.isArray(notifications) ||
        notifications.length === 0
      ) {
        this.logger.debug('No more pending notifications.');
        return;
      }

      this.logger.log(
        `Found ${notifications.length} notifications to dispatch to queue.`,
      );

      for (const item of notifications) {
        try {
          this.logger.log(
            `Queueing notification ${item.id} (${item.ids_notify_type})`,
          );

          // 1. Позначаємо в таблиці notify як PROCESSING
          await client.query(
            "UPDATE notify SET ids_status = 'PROCESSING' WHERE id = $1",
            [item.id],
          );

          // 2. Додаємо в чергу
          await this.dispatch(item.ids_notify_type, item);
        } catch (e) {
          this.logger.error(
            `Error dispatching notification ${item.id} (${item.ids_notify_type}): ${e.message}`,
          );
          await client.query(
            "UPDATE notify SET ids_status = 'FAILED' WHERE id = $1",
            [item.id],
          );
        }
      }
    } catch (e) {
      this.logger.error(`Batch dispatching failed: ${e.message}`);
    } finally {
      client.release();
    }
  }

  private async dispatch(notifyType: string, data: any) {
    const {
      person_list,
      id_person_list,
      content,
      id_tblref,
      tblref,
      notify_part,
      id: notificationId,
    } = data;
    const final_person_list = person_list || id_person_list || [];

    this.logger.log(
      `Dispatching notification type: ${notifyType} for part: ${notify_part} for table: ${tblref} to queue`,
    );

    if (notify_part === 'TENDER') {
      await this.tenderQueue.add('process-notification', {
        notificationId,
        notifyType,
        tenderId: id_tblref,
        content,
        personList: final_person_list,
      });
    } else {
      this.logger.warn(`No configured queue for notify_part: ${notify_part}`);
      // Можемо також зразу замінити статус на помилку або відкладено:
      await this.pgPool.query(
        "UPDATE notify SET ids_status = 'FAILED' WHERE id = $1",
        [notificationId],
      );
    }
  }
}
