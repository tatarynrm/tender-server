
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';
import { TelegramGateway } from './telegram.gateway';
import { DatabaseModule } from 'src/database/database.module';
import { RedisModule } from 'src/libs/common/redis/redis.module';
// ... ваші інші імпорти

@Module({
  controllers: [TelegramController],
  imports: [
    TelegrafModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        middlewares: [session()],
        token: config.get<string>('TELEGRAM_BOT_TOKEN')!, // Додаємо !
        // launchOptions: {
        //   webhook: {
        //     domain: config.get<string>('TELEGRAM_WEBHOOK_DOMAIN')!, // Додаємо !
        //     hookPath: '/telegram/telegram-webhook',
        //     // port: config.getOrThrow<number>('APPLICATION_PORT'),
        //   },
        // },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    RedisModule,
   
  ],
  providers: [TelegramService, TelegramUpdate, TelegramGateway],
  exports: [TelegramService],
})
export class TelegramModule {}
