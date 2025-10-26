import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (configService: ConfigService) => {
        // const client = createClient({
        //   url: configService.getOrThrow<string>('REDIS_URI'),
        // });
        // await client.connect();
        // return client;

        const user = configService.get<string>('REDIS_USER');
        const password = configService.get<string>('REDIS_PASSWORD');
        const host = configService.get<string>('REDIS_HOST');
        const port = configService.get<string>('REDIS_PORT');

        const url = password
          ? `redis://${user}:${password}@${host}:${port}`
          : `redis://${host}:${port}`;

        console.log('✅ Redis URL:', url); // тимчасово для перевірки

        const client = createClient({ url });
        await client.connect();
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
