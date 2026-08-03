import { Module } from '@nestjs/common';
import { MailReaderService } from './mail-reader.service';
import { AiModule } from '../ai/ai.module';

/**
 * Чистий конектор до пошти ICT (IMAP) + AI-класифікація.
 * Без залежності від Telegram — щоб TelegramModule міг його імпортувати без циклу.
 */
@Module({
  imports: [AiModule],
  providers: [MailReaderService],
  exports: [MailReaderService],
})
export class MailReaderModule {}
