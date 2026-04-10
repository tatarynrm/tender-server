import { Module } from '@nestjs/common';
import { DbEventsListener } from './db-events.listener';
import { DbEventsProcessor } from './db-events.processor';

@Module({
  providers: [DbEventsListener, DbEventsProcessor],
  exports: [DbEventsProcessor],
})
export class DbEventsModule {}
