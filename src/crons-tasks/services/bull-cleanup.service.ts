import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class BullCleanupService {
  private readonly logger = new Logger(BullCleanupService.name);

  constructor(
    @InjectQueue('tender-tasks') private readonly tenderTasksQueue: Queue,
    @InjectQueue('tender_notifications') private readonly tenderNotificationsQueue: Queue,
    @InjectQueue('currency-tasks') private readonly currencyTasksQueue: Queue,
    @InjectQueue('email-mailing') private readonly emailMailingQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanCompletedJobs() {
    this.logger.log('Starting daily cleanup of completed BullMQ jobs...');
    
    const queues = [
      this.tenderTasksQueue,
      this.tenderNotificationsQueue,
      this.currencyTasksQueue,
      this.emailMailingQueue,
    ];

    for (const queue of queues) {
      try {
        let cleanedCount = 0;
        let count = 0;
        do {
          const jobIds = await queue.clean(0, 1000, 'completed');
          count = jobIds.length;
          cleanedCount += count;
        } while (count > 0);
        
        this.logger.log(`Cleaned ${cleanedCount} completed jobs for queue: ${queue.name}`);
      } catch (error) {
        this.logger.error(`Failed to clean queue ${queue.name}:`, error);
      }
    }
    
    this.logger.log('Finished daily cleanup of completed BullMQ jobs.');
  }
}
