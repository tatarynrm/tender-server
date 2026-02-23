// import { Module } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { TelegrafModule } from 'nestjs-telegraf';
// import { session } from 'telegraf';
// import { TelegramController } from './telegram.controller';
// import { TelegramService } from './telegram.service';
// import { TelegramUpdate } from './telegram.update';
// import { TelegramGateway } from './telegram.gateway';
// import { DatabaseModule } from 'src/database/database.module';
// import { RedisModule } from 'src/libs/common/redis/redis.module';

// @Module({
//   // Контролер більше не потрібен для Polling, але можна залишити
//   controllers: [TelegramController],
//   imports: [
//     TelegrafModule.forRootAsync({
//       inject: [ConfigService],
//       useFactory: (config: ConfigService) => ({
//         token: config.get<string>('TELEGRAM_BOT_TOKEN')!,
//         middlewares: [session()],
//         // Якщо launchOptions порожній або undefined — вмикається Polling
//         launchOptions: undefined,
//       }),
//     }),
//     DatabaseModule,
//     RedisModule,
//   ],
//   providers: [TelegramService, TelegramUpdate, TelegramGateway],
//   exports: [TelegramService],
// })
// export class TelegramModule {}
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
  imports: [
    DatabaseModule,
    RedisModule,
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get<string>('TELEGRAM_BOT_TOKEN')!,
        middlewares: [session()],
        // Важливо: ми нічого не передаємо в launchOptions, 
        // щоб уникнути конфлікту з ручним Webhook
      }),
    }),
  ],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramUpdate, TelegramGateway],
  exports: [TelegramService],
})
export class TelegramModule {}