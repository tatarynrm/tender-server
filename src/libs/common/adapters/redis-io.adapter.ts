import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import { INestApplicationContext, Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const configService = this.app.get(ConfigService);
    const host = configService.getOrThrow<string>('REDIS_HOST');
    const port = configService.getOrThrow<string>('REDIS_PORT');
    const user = configService.get<string>('REDIS_USER');
    const password = configService.get<string>('REDIS_PASSWORD');

    const auth = user && password ? `${user}:${password}@` : '';
    const redisUrl = `redis://${auth}${host}:${port}`;

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Successfully connected to Redis for WebSockets');
    } catch (error) {
      this.logger.error('Failed to connect to Redis for WebSockets', error);
      throw error;
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
