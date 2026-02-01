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
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        const token = config.get<string>('TELEGRAM_BOT_TOKEN')!;

        return {
          token,
          middlewares: [session()],
          // Якщо Production — додаємо Webhook, якщо ні — пустий об'єкт (Polling)
          launchOptions: isProd
            ? {
                webhook: {
                  domain: config.get<string>('TELEGRAM_WEBHOOK_DOMAIN')!,
                  hookPath: '/api/telegram-webhook', // шлях, за яким Nest чекатиме запити
                  port: config.getOrThrow<number>('APPLICATION_PORT'),
                },
              }
            : undefined,
        };
      },
    }),
    DatabaseModule,
    RedisModule,
  ],
  providers: [TelegramService, TelegramUpdate, TelegramGateway],
  exports: [TelegramService],
})
export class TelegramModule {}
