import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class TenderCronService implements OnModuleInit {
  private readonly logger = new Logger(TenderCronService.name);

  constructor(
    @InjectQueue('tender-tasks') private readonly tenderQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('📡 Ініціалізація масштабованих черг для тендерів...');
    
    // Видаляємо старі повторювані мети, якщо потрібно (опціонально)
    // await this.tenderQueue.drain(); 

    // Додаємо повторювану задачу (кожні 10 секунд)
    // BullMQ гарантує, що вона буде виконуватись лише ОДНИМ екземпляром сервера в кластері
    await this.tenderQueue.add(
      'update-tender-timer',
      {},
      {
        repeat: {
          every: 10000, // 10 секунд
        },
        removeOnComplete: true, // Чистити завершені задачі для економії пам'яті в Redis
        removeOnFail: 100,      // Зберігати останні 100 помилок для дебагу
      },
    );

    this.logger.log('✅ Масштабована задача "update-tender-timer" зареєстрована в Redis');
  }
}
