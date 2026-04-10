import { Module } from '@nestjs/common';
import { DbEventsListener } from './db-events.listener';
import { DbEventsProcessor } from './db-events.processor';

import { TelegramModule } from 'src/telegram/telegram.module';
import { SocketModule } from 'src/socket/socket.module';
import { MailModule } from 'src/libs/common/mail/mail.module';
import { BullModule } from '@nestjs/bullmq';

import { NotificationWorker } from './processors/notification.worker';

@Module({
  imports: [
    TelegramModule,
    SocketModule,
    MailModule,
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  providers: [DbEventsListener, DbEventsProcessor, NotificationWorker],
  exports: [DbEventsProcessor],
})
export class DbEventsModule {}
