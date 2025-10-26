import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (configService: ConfigService): Promise<RedisClientType> => {
        const user = configService.get<string>('REDIS_USER');
        const password = configService.get<string>('REDIS_PASSWORD');
        const host = configService.get<string>('REDIS_HOST');
        const port = configService.get<string>('REDIS_PORT');

        const url = `redis://${user}:${password}@${host}:${port}`;
        console.log('✅ Redis URL:', url); // для перевірки

        const client: RedisClientType = createClient({ url });

        client.on('error', (err) => console.error('Redis Client Error:', err));
        client.on('connect', () => console.log('✅ Redis connected successfully'));

        await client.connect();
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
