import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { UserService } from '../user/user.service';
import { ConfigModule } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import { TelegramUpdate } from './telegram.update';
import { DatabaseModule } from 'src/database/database.module';
import { TelegramGateway } from './telegram.gateway';
import { TelegramController } from './telegram.controller';

@Module({
  controllers: [TelegramController],
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
    }),
    TelegrafModule.forRoot({
      middlewares: [session()],
      token: process.env.TELEGRAM_BOT_TOKEN!,

      launchOptions: {
        webhook: {
          domain: process.env.TELEGRAM_WEBHOOK_DOMAIN!, // наприклад, https://yourdomain.com
          hookPath: '/telegram/telegram-webhook', // шлях для webhook
          port: 4001,
        },
      },
    }),
    DatabaseModule,
  ],
  providers: [TelegramService, TelegramUpdate, TelegramGateway],
  exports: [TelegramService],
})
export class TelegramModule {}
