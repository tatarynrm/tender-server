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
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get('TELEGRAM_BOT_TOKEN')!,
        middlewares: [session()],
        // Додаємо налаштування клієнта
        telegram: {
          agent: null, // Можна налаштувати проксі, якщо сервер заблоковано
          webhookReply: true, // Пришвидшує відповіді на вебхуках
        },
        launchOptions:
          config.get('NODE_ENV') === 'production'
            ? {
                webhook: {
                  domain: config.getOrThrow<string>('TELEGRAM_WEBHOOK_DOMAIN'),
                  hookPath: '/telegram/telegram-webhook',
                },
              }
            : undefined,
      }),
    }),
    DatabaseModule,
    RedisModule,
  ],
  providers: [TelegramService, TelegramUpdate, TelegramGateway],
  exports: [TelegramService],
})
export class TelegramModule {}
