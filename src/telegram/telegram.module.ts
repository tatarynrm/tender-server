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
        const token = config.get<string>('TELEGRAM_BOT_TOKEN')!;
        const isProd = config.get<string>('NODE_ENV') === 'production';

        return {
          token,
          middlewares: [session()],
          // На Dev — використовуємо Polling (автоматично, якщо немає webhook)
          // На Prod — вмикаємо Webhook вбудованими засобами NestJS
          launchOptions: isProd
            ? {
                webhook: {
                  domain: config.get<string>('TELEGRAM_WEBHOOK_DOMAIN')!,
                  hookPath: '/api/telegram/telegram-webhook',
                },
              }
            : undefined, // undefined змусить Telegraf працювати в режимі Polling
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
