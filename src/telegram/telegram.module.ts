import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { UserService } from '../user/user.service';

@Module({
  providers: [TelegramService, UserService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
