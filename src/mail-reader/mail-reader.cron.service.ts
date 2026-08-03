import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MAIL_READER_QUEUE } from './mail-reader.processor';

const REPEAT_JOB_NAME = 'check-ict-mail';

/**
 * Реєструє повторювану задачу перевірки пошти в BullMQ.
 * BullMQ гарантує виконання лише одним екземпляром у кластері (координація через Redis).
 */
@Injectable()
export class MailReaderCronService implements OnModuleInit {
  private readonly logger = new Logger(MailReaderCronService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(MAIL_READER_QUEUE) private readonly mailQueue: Queue,
  ) {}

  async onModuleInit() {
    const enabled =
      (this.config.get<string>('MAIL_READER_ENABLED') ?? 'true') !== 'false';

    // Прибираємо попередні повторювані задачі, щоб не було дублів після зміни інтервалу.
    const repeatables = await this.mailQueue.getRepeatableJobs();
    for (const job of repeatables) {
      if (job.name === REPEAT_JOB_NAME) {
        await this.mailQueue.removeRepeatableByKey(job.key);
      }
    }

    if (!enabled) {
      this.logger.warn('⏸️ MAIL_READER_ENABLED=false — перевірку пошти вимкнено.');
      return;
    }

    const intervalMs =
      Number(this.config.get<number>('MAIL_READER_INTERVAL_MS')) || 60000;

    await this.mailQueue.add(
      REPEAT_JOB_NAME,
      {},
      {
        repeat: { every: intervalMs },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    this.logger.log(
      `✅ Перевірку пошти ICT зареєстровано (кожні ${Math.round(intervalMs / 1000)} с).`,
    );
  }
}
