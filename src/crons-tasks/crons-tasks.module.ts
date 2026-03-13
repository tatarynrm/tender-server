import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TenderCronService } from './services/tender-cron.service';
import { TenderProcessor } from './processors/tender.processor';
import { TenderModule } from 'src/tender/tender.module';

@Module({
  imports: [
    // Реєструємо чергу для цього модуля
    BullModule.registerQueue({
      name: 'tender-tasks',
    }),
    // Потрібен TenderGateway, який зазвичай в TenderModule або окремо
    TenderModule,
  ],
  providers: [TenderCronService, TenderProcessor],
  exports: [TenderCronService],
})
export class CronTasksModule {}