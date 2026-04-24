import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { TelegramService } from 'src/telegram/telegram.service';
import { SocketService } from 'src/socket/socket.service';
import { MailService } from 'src/libs/common/mail/mail.service';
import {
  getEmailData,
  getTelegramMessage,
  getWebMessage,
} from './tender-notification.helper';

@Injectable()
@Processor('tender_notifications')
export class TenderWorker extends WorkerHost {
  private readonly logger = new Logger(TenderWorker.name);

  constructor(
    @Inject('PG_POOL') private readonly pgPool: Pool,
    private readonly telegramService: TelegramService,
    private readonly socketService: SocketService,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name !== 'process-notification') {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    const { notificationId, notifyType, content, personList } = job.data;

    try {
      this.logger.log(
        `Starting to process notification ${notificationId} of type ${notifyType}`,
      );

      switch (notifyType) {
        case 'TENDER_ACTUAL':
        case 'TENDER_PLAN':
        case 'TENDER_CHANGED':
        case 'TENDER_PROLONGATION':
        case 'TENDER_CLOSED':
        case 'TENDER_RESULT':
          await this.handlePersonalBulkNotification(
            personList,
            content,
            notifyType,
          );
          break;
        case 'TENDER_MESSAGE_ANY':
          console.log(job.data, 'JOB DATA ANY');

          await this.handlePersonalBulkNotification(
            personList,
            content,
            notifyType,
          );
          break;
        default:
          this.logger.warn(`Unknown notifyType: ${notifyType}`);
      }

      // Mark as DONE
      this.logger.log(
        `Notification ${notificationId} processed successfully, marking as DONE`,
      );
      await this.pgPool.query(
        "UPDATE notify SET ids_status = 'DONE' WHERE id = $1",
        [notificationId],
      );

      return { status: 'success' };
    } catch (e) {
      this.logger.error(
        `Error processing notification ${notificationId}: ${e.message}`,
      );
      await this.pgPool.query(
        "UPDATE notify SET ids_status = 'FAILED' WHERE id = $1",
        [notificationId],
      );
      throw e;
    }
  }

  private async handlePersonalBulkNotification(
    personList: any[],
    content: any,
    notifyType: string,
  ) {
    if (!personList || personList.length === 0) {
      this.logger.debug(`No persons to notify for tender ${content?.id}`);
      return;
    }

    this.logger.debug(
      `Processing bulk personal notification for ${personList.length} persons. Recipients: ${personList.map((p) => p.id_person || p.id).join(', ')}`,
    );

    const BATCH_SIZE = 25;
    const DELAY_MS = 1500;

    for (let i = 0; i < personList.length; i += BATCH_SIZE) {
      const batch = personList.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (person) => {
          const {
            id_person,
            to_web,
            to_telegram,
            to_email,
            telegram_id,
            email,
          } = person;

          this.logger.debug(
            `Notifying person ${id_person || person.id}: web=${!!to_web}, tg=${!!to_telegram}, email=${!!to_email} (${email || 'no email'})`,
          );

          try {
            // 1. Web & Telegram
            if (to_web && id_person) {
              const webMessage = getWebMessage(content, notifyType, person);
              await this.socketService.sendNotification(
                String(id_person),
                webMessage,
              );
            }

            if (to_telegram && telegram_id) {
              const telegramMessage = getTelegramMessage(
                content,
                notifyType,
                person,
              );
              await this.telegramService.sendMessageToUser(
                id_person,
                telegramMessage,
                telegram_id,
              );
            }

            // 2. Email
            if (to_email && person.email) {
              const emailPayload = getEmailData(content, notifyType, person);
              await this.mailService.sendTenderNotification(
                person.email,
                emailPayload,
              );
            }
          } catch (err) {
            this.logger.error(
              `Failed to notify person ${id_person}: ${err.message}`,
            );
          }
        }),
      );

      if (i + BATCH_SIZE < personList.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }
  }
}
