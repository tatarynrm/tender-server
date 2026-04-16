import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { TelegramService } from 'src/telegram/telegram.service';
import { SocketService } from 'src/socket/socket.service';
import { MailService } from 'src/libs/common/mail/mail.service';

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

    const { notificationId, notifyType, tenderId, content, personList } =
      job.data;

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
        case 'TENDER_STATUS_CHANGED':
          // await this.handleStatusChangedNotification(tenderId, content);
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

  // private async handleStatusChangedNotification(
  //   tenderId: number,
  //   content: any,
  // ) {
  //   if (!tenderId) return;

  //   this.logger.log(
  //     `Processing status change notification for tender ${tenderId}`,
  //   );
  //   try {
  //     await this.socketService.sendNotification(
  //       'ALL',
  //       `Тендер №${tenderId} змінив статус на ${content?.ids_status || 'НЕВІДОМИЙ'}`,
  //     );
  //   } catch (err) {
  //     this.logger.error(`Failed to send status notification: ${err.message}`);
  //     // Usually better not to throw if we want the DB marked DONE,
  //     // but if we want BullMQ to retry, we throw.
  //     // For now, let's log it.
  //   }
  // }

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
      `Processing bulk personal notification for ${personList.length} persons`,
    );

    const from =
      (content.load_from || [])
        .map((f: any) => `${f.city} (${f.country || 'UA'})`)
        .join(', ') || 'Не вказано';
    const to =
      (content.load_to || [])
        .map((t: any) => `${t.city} (${t.country || 'UA'})`)
        .join(', ') || 'Не вказано';
    const trailer =
      (content.trailer || []).map((tr: any) => tr.type).join(', ') ||
      'Будь-який';

    const message = `
🆕 <b>Актуальний тендер №${content.id}</b>
📦 <b>Вантаж:</b> ${content.cargo || '—'} (${content.weight || 0}т / ${content.volume || 0}м³)
📍 <b>Звідки:</b> ${from}
🏁 <b>Куди:</b> ${to}
🚛 <b>Транспорт:</b> ${trailer} (${content.car_count || 1} авто)
💰 <b>Тип:</b> ${content.tender_type || 'Тендер'}
    `.trim();

    const BATCH_SIZE = 25;
    const DELAY_MS = 1500; // 1.5 seconds

    for (let i = 0; i < personList.length; i += BATCH_SIZE) {
      const batch = personList.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (person) => {
          const { id_person, to_web, to_telegram, to_email, telegram_id } =
            person;

          try {
            // 1. Web (Socket)
            if (to_web && id_person) {
              await this.socketService.sendNotification(
                String(id_person),
                message,
              );
            }

            // 2. Telegram
            if (to_telegram && telegram_id) {
              console.log(
                'Sending Telegram notification to person 149 line',
                id_person,
                message,
                telegram_id,
              );
              await this.telegramService.sendMessageToUser(
                id_person,
                message,
                telegram_id,
              );
            }

            // 3. Email
            if (to_email && person.email) {
              const emailPayload = {
                type: notifyType,
                tenderId: content.id,
                data: {
                  date: content.date_start,
                  endDate: content.date_end,
                  cargo: content.cargo,
                  requirements: trailer,
                  route: `${from} ➡️ ${to}`,
                  duration: content.duration
                    ? `${content.duration} хв.`
                    : undefined,
                  step: content.step_price
                    ? `${content.step_price} ${content.ids_valut || 'грн'}`
                    : undefined,
                  buyout: content.is_buyout,
                  message: content.message || content.comments,
                  isWinner: person.is_winner,
                  tenderType: content.tender_type,
                },
              };

              await this.mailService.sendTenderNotification(
                person.email,
                emailPayload,
              );
            }
          } catch (err) {
            this.logger.error(
              `Failed to notify person ${id_person}: ${err.message}`,
            );
            // We do NOT throw here so that one failed message doesn't prevent others from being sent!
          }
        }),
      );

      // Затримка між партіями (якщо є ще користувачі в списку)
      if (i + BATCH_SIZE < personList.length) {
        this.logger.debug(
          `Batch of ${BATCH_SIZE} handled. Waiting ${DELAY_MS}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }
  }
}
