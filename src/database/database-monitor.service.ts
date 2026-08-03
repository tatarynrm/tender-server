import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from './database.service';

@Injectable()
export class DatabaseMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseMonitorService.name);
  private lastCheck: Date | null = null;
  private client: any = null;

  // 1. ПРАПОРЕЦЬ-ЗАМОК
  private counter = 0;
  private isProcessing = false;

  constructor(private readonly dbservice: DatabaseService) {
    this.lastCheck = new Date();
  }

  async onModuleInit() {
    await this.establishConnection();
  }

  private async establishConnection() {
    try {
      if (this.client) {
        try {
          this.client.release();
        } catch (e) {}
      }
      this.client = await this.dbservice.getClient();
      this.logger.log('✅ Встановлено постійне з’єднання з БД');
      this.client.on('error', (err) => {
        this.logger.error('Постійне з’єднання розірвано!', err);
        this.client = null;
      });
    } catch (error) {
      this.logger.error(`Не вдалося підключитися: ${error.message}`);
      this.client = null;
    }
  }

  // @Cron(CronExpression.EVERY_5_SECONDS)
  // public async getStatus() {
  //   // 2. ПЕРЕВІРКА ЗАМКА: Якщо процес ще йде — просто виходимо
  //   if (this.isProcessing) {
  //     this.logger.warn(
  //       '⏳ Попередній процес ще триває, пропускаємо ітерацію...',
  //     );
  //     return;
  //   }
  //   this.isProcessing = true;

  //   if (!this.client) {
  //     this.logger.warn('Спроба відновити з’єднання...');
  //     await this.establishConnection();
  //     if (!this.client) return;
  //   }

  //   // 3. АКТИВУЄМО ЗАМОК


  //   try {
  //     const result = await this.client.query(
  //       'SELECT notify_count() as count',
  //     );
  //     const dbCounter = result.rows[0].count;
  //     console.log(dbCounter,'DB COUNTER');
      

  //        if (dbCounter > 0) {
  //       this.logger.log(`🔔 Знайдено нові зміни! Обробка...`);

  //       // --- ПОЧАТОК ОБРОБКИ (наприклад, розсилка) ---
  //       // Тут ви робите ваші довгі запити та цикли розсилки
  //       // await this.getCurrentChanges();
  //       // ---------------------------------------------

  //     } else {
  //       this.logger.debug('Змін немає.');
  //     }
  //   } catch (error) {
  //     this.logger.error('Помилка під час виконання:', error.message);
  //     this.client = null;
  //   } finally {
  //     // 4. ЗНІМАЄМО ЗАМОК у будь-якому випадку (навіть при помилці)
  //     this.isProcessing = false;
  //   }
  // }

  public async getCurrentChanges() {
    if (!this.client) {
      this.logger.warn('Немає з’єднання для отримання змін.');
      return null;
    }

 
      const result = await this.client.query(
        `select notify_content() as notify_content`,
      );

      return result.rows;

  }

  private async longProcessMessaging() {
    // Імітація довгої роботи (наприклад, 15 секунд)
    // Якщо цей метод працює довше за інтервал крону,
    // прапорець isProcessing захистить від повторного запуску.
    return new Promise((resolve) => setTimeout(resolve, 15000));
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.release();
    }
  }
}
