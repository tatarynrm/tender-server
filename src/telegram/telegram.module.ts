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

@Module({
  controllers: [TelegramController],
  imports: [
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        
        return {
          token: config.get<string>('TELEGRAM_BOT_TOKEN')!,
          middlewares: [session()],
          /* ВАЖЛИВО: На продакшні ставимо false.
             Ми реєструємо вебхук вручну в TelegramService, 
             а запити приймаємо через TelegramController.
          */
          launchOptions: isProd ? false : undefined,
          
          telegram: {
            webhookReply: true, // Залишаємо для швидкості
          },
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