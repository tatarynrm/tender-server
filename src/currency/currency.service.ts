import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CurrencyService implements OnModuleInit {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(
    @InjectQueue('currency-tasks') private readonly currencyQueue: Queue,
  ) { }

  async onModuleInit() {
    this.logger.log('📡 Налаштування масштабованих задач для валют...');

    // 1. Одноразовий запуск при старті (лише один раз на весь кластер)
    // Використовуємо jobId, щоб запобігти дублюванню
    await this.currencyQueue.add(
      'fetch-nbu-rates',
      {},
      { jobId: `initial-fetch-${new Date().toISOString().split('T')[0]}` }
    );


    // 2. Розклад: 07:50
    await this.addRepeatableJob('morning-early', '0 50 7 * * *');

    // 3. Розклад: 09:00
    await this.addRepeatableJob('morning', '0 0 9 * * *');

    // 4. Розклад: 18:00
    await this.addRepeatableJob('evening-seven', '0 0 18 * * *');

    // 5. Розклад: 23:00
    await this.addRepeatableJob('evening', '0 0 23 * * *');

    this.logger.log('✅ Всі валютні крони переведено на масштабовану чергу BullMQ');
  }

  private async addRepeatableJob(name: string, cron: string) {
    await this.currencyQueue.add(
      'fetch-nbu-rates',
      {},
      {
        repeat: { pattern: cron, tz: 'Europe/Kyiv' },
        removeOnComplete: true,
        removeOnFail: 100,
      }
    );
  }
}
