import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis'; // Використовуємо redis.createClient
import session from 'express-session';
import { ms, StringValue } from './libs/common/utils/ms.util';
import { parseBoolean } from './libs/common/utils/parse-boolean.util';
import { RedisStore } from 'connect-redis';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);

  // Підключення до Redis за допомогою бібліотеки redis
  const redisClient = app.get<RedisClientType>('REDIS_CLIENT'); // 🔹 беремо з DI

  app.use(cookieParser(config.getOrThrow<string>('COOKIES_SECRET')));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.ALLOWED_ORIGIN!,
    credentials: true,
  });
  const IS_DEV = process.env.NODE_ENV!;
  console.log(IS_DEV, 'IS DEV');

  // LOCAL!!!!
  app.use(
    session({
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      name: config.getOrThrow<string>('SESSION_NAME'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV! === 'production', // для продакшн HTTPS
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24,
        domain: IS_DEV ? undefined : '.dragan-tataryn.site', // доступне на всіх субдоменах
      },
      store: new RedisStore({
        client: redisClient,
        prefix: config.getOrThrow<string>('SESSION_FOLDER'),
        ttl: 60 * 60 * 24, // Тривалість сесії в Redis
      }),
    }),
  );

  await app.listen(config.getOrThrow<number>('APPLICATION_PORT'), '0.0.0.0');
}

bootstrap();
