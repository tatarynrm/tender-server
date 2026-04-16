import { Global, Module } from '@nestjs/common';
import { TelegramTokenController } from './telegram-token.controller';
import { TelegramTokenService } from './telegram-token.service';
import { MailModule } from 'src/libs/common/mail/mail.module';
import { MailService } from 'src/libs/common/mail/mail.service';

@Global()
@Module({
  imports:[MailModule],
  controllers: [TelegramTokenController],
  providers: [TelegramTokenService, MailService],
  exports: [TelegramTokenService], // якщо інші модулі будуть його використовувати
})
export class TelegramTokenModule {}
