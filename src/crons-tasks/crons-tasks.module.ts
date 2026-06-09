import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TenderCronService } from './services/tender-cron.service';
import { TenderProcessor } from './processors/tender.processor';
import { TenderModule } from 'src/tender/tender.module';
import { BullCleanupService } from './services/bull-cleanup.service';

@Module({
  imports: [
    // Реєструємо черги для очищення та інших задач
    BullModule.registerQueue({ name: 'tender-tasks' }),
    BullModule.registerQueue({ name: 'tender_notifications' }),
    BullModule.registerQueue({ name: 'currency-tasks' }),
    BullModule.registerQueue({ name: 'email-mailing' }),
    // Потрібен TenderGateway, який зазвичай в TenderModule або окремо
    TenderModule,
  ],
  providers: [TenderCronService, TenderProcessor, BullCleanupService],
  exports: [TenderCronService],
})
export class CronTasksModule {}