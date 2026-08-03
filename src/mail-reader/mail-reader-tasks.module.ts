import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailReaderModule } from './mail-reader.module';
import { MailReaderProcessor, MAIL_READER_QUEUE } from './mail-reader.processor';
import { MailReaderCronService } from './mail-reader.cron.service';
import { TelegramModule } from '../telegram/telegram.module';

/**
 * Фонова частина: повторювана BullMQ-задача перевірки пошти + сповіщення адміну.
 * Імпортує MailReaderModule (конектор) і TelegramModule (notifyAdmin).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: MAIL_READER_QUEUE }),
    MailReaderModule,
    TelegramModule,
  ],
  providers: [MailReaderProcessor, MailReaderCronService],
})
export class MailReaderTasksModule {}
