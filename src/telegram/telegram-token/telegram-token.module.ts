// src/telegram-token/telegram-token.module.ts
import { Module } from '@nestjs/common';
import { TelegramTokenController } from './telegram-token.controller';
import { UserService } from 'src/user/user.service';

@Module({
  controllers: [TelegramTokenController],
  providers: [UserService],
})
export class TelegramTokenModule {}
