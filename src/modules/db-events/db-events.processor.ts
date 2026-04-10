import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class DbEventsProcessor {
  private readonly logger = new Logger(DbEventsProcessor.name);

  constructor(
    @Inject('PG_POOL') private readonly pgPool: Pool,
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
  ) {}

  async processEvents(payload?: any) {
    this.logger.log(
      `Processing database events dispatching to queue. Notification signal: ${JSON.stringify(payload) || 'empty'}`,
    );

    const client = await this.pgPool.connect();
    try {
      let hasMore = true;

      do {
        const result = await client.query('SELECT notify_list()');
        const notifications = result.rows[0]?.notify_list;

        if (
          !notifications ||
          !Array.isArray(notifications) ||
          notifications.length === 0
        ) {
          this.logger.debug('No more pending notifications.');
          hasMore = false;
          continue;
        }

        this.logger.log(
          `Found ${notifications.length} notifications to dispatch to queue.`,
        );

        for (const item of notifications) {
          try {
            await this.dispatch(item.ids_notify_type, item);

            // Позначаємо як оброблене диспетчером (відправлено в чергу)
            await client.query(
              'UPDATE sys_notifications SET status = $1, processed_at = NOW() WHERE id = $2',
              ['DISPATCHED', item.id],
            );
          } catch (e) {
            this.logger.error(
              `Error dispatching notification ${item.id} (${item.ids_notify_type}): ${e.message}`,
            );
            await client.query(
              'UPDATE sys_notifications SET status = $1, error_message = $2 WHERE id = $3',
              ['ERROR', e.message, item.id],
            );
          }
        }
      } while (hasMore);
    } catch (e) {
      this.logger.error(`Batch dispatching failed: ${e.message}`);
    } finally {
      client.release();
    }
  }

  private async dispatch(notifyType: string, data: any) {
    const { person_list, id_person_list, content, id_tblref, tblref, id: notificationId } = data;
    const final_person_list = person_list || id_person_list;

    this.logger.log(
      `Dispatching notification type: ${notifyType} for table: ${tblref} to queue`,
    );

    switch (notifyType) {
      case 'TENDER_ACTUAL':
        await this.handleTenderActual(notificationId, final_person_list, content);
        break;

      case 'TENDER_STATUS_CHANGED':
        await this.handleTenderStatusChanged(notificationId, id_tblref, content);
        break;

      default:
        this.logger.warn(`No handler for notification type: ${notifyType}`);
    }
  }

  private async handleTenderStatusChanged(notificationId: number, tenderId: number, content: any) {
    await this.notificationQueue.add('tender-status-changed', {
        notificationId,
        tenderId,
        content
    });
  }

  private async handleTenderActual(notificationId: number, personList: any[], content: any) {
    if (!personList || personList.length === 0) return;

    this.logger.log(`Adding ${personList.length} notification jobs for tender ${content.id}`);

    for (const person of personList) {
      await this.notificationQueue.add('send-personal-notification', {
        notificationId,
        person,
        content,
      });
    }
  }
}
