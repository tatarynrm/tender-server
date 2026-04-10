import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import createSubscriber, { Subscriber } from 'pg-listen';
import { DbEventsProcessor } from './db-events.processor';

@Injectable()
export class DbEventsListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbEventsListener.name);
  private subscriber: Subscriber;

  constructor(
    private readonly configService: ConfigService,
    private readonly processor: DbEventsProcessor,
  ) {
    this.subscriber = createSubscriber({
      host: this.configService.get<string>('POSTGRES_HOST'),
      port: this.configService.get<number>('POSTGRES_PORT'),
      user: this.configService.get<string>('POSTGRES_USER'),
      password: this.configService.get<string>('POSTGRES_PASSWORD'),
      database: this.configService.get<string>('POSTGRES_DB'),
    });

    this.subscriber.events.on('error', (error) => {
      this.logger.error('Postgres listener error', error);
    });
  }

  async onModuleInit() {
    try {
      await this.subscriber.connect();
      await this.subscriber.listenTo('db_notification');
      
      this.logger.log('Listening for "db_notification" channel...');

      this.subscriber.notifications.on('db_notification', async (payload) => {
        this.logger.log(`Received notification on "db_notification" channel`);
        // Викликаємо процесор для обробки подій, передаючи payload якщо він є
        await this.processor.processEvents(payload);
      });

    } catch (error) {
      this.logger.error('Failed to connect to Postgres for listening', error);
    }
  }

  async onModuleDestroy() {
    await this.subscriber.close();
  }
}
