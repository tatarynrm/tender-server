import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { TelegramService } from 'src/telegram/telegram.service';
import { SocketService } from 'src/socket/socket.service';
import { MailService } from 'src/libs/common/mail/mail.service';

@Injectable()
@Processor('notifications')
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    @Inject('PG_POOL') private readonly pgPool: Pool,
    private readonly telegramService: TelegramService,
    private readonly socketService: SocketService,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'send-personal-notification':
        return this.handlePersonalNotification(job.data);
      case 'tender-status-changed':
        return this.handleStatusChangedNotification(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleStatusChangedNotification(data: any) {
    const { tenderId, content } = data;
    this.logger.log(`Processing status change notification for tender ${tenderId}`);
    
    try {
      await this.socketService.sendNotification(
        'ALL', 
        `Тендер №${tenderId} змінив статус на ${content.ids_status}`
      );
      return { status: 'success' };
    } catch (err) {
      this.logger.error(`Failed to send status notification: ${err.message}`);
      throw err;
    }
  }

  private async handlePersonalNotification(data: any) {
    const { person, content } = data;
    const { id_person, to_web, to_telegram, to_email } = person;

    this.logger.debug(`Processing personal notification for person ${id_person}`);

    const from = (content.load_from || []).map((f: any) => `${f.city} (${f.country || 'UA'})`).join(', ') || 'Не вказано';
    const to = (content.load_to || []).map((t: any) => `${t.city} (${t.country || 'UA'})`).join(', ') || 'Не вказано';
    const trailer = (content.trailer || []).map((tr: any) => tr.type).join(', ') || 'Будь-який';

    const message = `
🆕 <b>Актуальний тендер №${content.id}</b>
📦 <b>Вантаж:</b> ${content.cargo || '—'} (${content.weight || 0}т / ${content.volume || 0}м³)
📍 <b>Звідки:</b> ${from}
🏁 <b>Куди:</b> ${to}
🚛 <b>Транспорт:</b> ${trailer} (${content.car_count || 1} авто)
💰 <b>Тип:</b> ${content.tender_type || 'Тендер'}
    `.trim();

    try {
      // 1. Web (Socket)
      if (to_web) {
        await this.socketService.sendNotification(String(id_person), message);
      }

      // 2. Telegram
      if (to_telegram) {
        await this.telegramService.sendMessageToUser(id_person, message);
      }

      // 3. Email
      if (to_email) {
        this.logger.debug(`Email notification requested for person ${id_person}`);
        // await this.mailService.sendMail(..., 'Новий актуальний тендер', message);
      }

      return { status: 'success', personId: id_person };
    } catch (err) {
      this.logger.error(`Failed to notify person ${id_person}: ${err.message}`);
      throw err;
    }
  }
}
