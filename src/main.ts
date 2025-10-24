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

  // app.use(
  //   session({
  //     secret: config.getOrThrow<string>('SESSION_SECRET'),
  //     name: config.getOrThrow<string>('SESSION_NAME'),
  //     resave: false,
  //     saveUninitialized: false,
  //     cookie: {
  //       domain: config.getOrThrow<string>('SESSION_DOMAIN'),
  //       maxAge: ms(config.getOrThrow<StringValue>('SESSION_MAX_AGE')),
  //       httpOnly: parseBoolean(config.getOrThrow<string>('SESSION_HTTP_ONLY')),
  //       secure: parseBoolean(config.getOrThrow<string>('SESSION_SECURE')),
  //       sameSite: 'lax',
  //     },

  //     store: new RedisStore({
  //       client: redisClient, // Підключення через redis.createClient
  //       prefix: config.getOrThrow<string>('SESSION_FOLDER'),
  //     }),
  //   }),
  // );

  // app.enableCors({
  //   origin: config.getOrThrow<string>('ALLOWED_ORIGIN'),
  //   credentials: true,
  //   exposedHeaders: ['set-cookies'],
  // });
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  // LOCAL!!!!
  app.use(
    session({
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      name: config.getOrThrow<string>('SESSION_NAME'), // centrifuge
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: false, // бо без HTTPS
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24,
        domain: undefined,
      },
      store: new RedisStore({
        client: redisClient,
        prefix: config.getOrThrow<string>('SESSION_FOLDER'),
        ttl: 60 * 60 * 24,
      }),
    }),
  );



  await app.listen(config.getOrThrow<number>('APPLICATION_PORT'));
}

bootstrap();
