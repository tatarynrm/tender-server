// src/telegram-token/telegram-token.module.ts
import { Module } from '@nestjs/common';
import { TelegramTokenController } from './telegram-token.controller';
import { UserService } from 'src/user/user.service';
import { TelegramTokenService } from './telegram-token.service';
import { MailModule } from 'src/libs/common/mail/mail.module';
import { MailService } from 'src/libs/common/mail/mail.service';

@Module({
  imports:[MailModule],
  controllers: [TelegramTokenController],
  providers: [UserService, TelegramTokenService,MailService],
  exports: [TelegramTokenService], // якщо інші модулі будуть його використовувати
})
export class TelegramTokenModule {}
