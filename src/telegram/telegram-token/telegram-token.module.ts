// src/telegram-token/telegram-token.module.ts
import { Module } from '@nestjs/common';
import { TelegramTokenController } from './telegram-token.controller';
import { UserService } from 'src/user/user.service';
import { TelegramTokenService } from './telegram-token.service';

@Module({
  controllers: [TelegramTokenController],
  providers: [UserService, TelegramTokenService],
  exports: [TelegramTokenService], // якщо інші модулі будуть його використовувати
})
export class TelegramTokenModule {}
