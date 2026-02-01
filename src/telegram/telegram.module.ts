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

        return {
          token,
          middlewares: [session()],
          /* ВАЖЛИВО: Встановлюємо launchOptions у false.
            Це вимикає вбудований сервер Telegraf. 
            NestJS сам прийматиме запити через ваш TelegramController.
          */
          launchOptions: false, 
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
