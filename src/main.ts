// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import cookieParser from 'cookie-parser';
// import { ConfigService } from '@nestjs/config';
// import { ValidationPipe } from '@nestjs/common';
// import { createClient, RedisClientType } from 'redis'; // Використовуємо redis.createClient
// import session from 'express-session';
// import { ms, StringValue } from './libs/common/utils/ms.util';
// import { parseBoolean } from './libs/common/utils/parse-boolean.util';
// import { RedisStore } from 'connect-redis';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   const config = app.get(ConfigService);

//   // Підключення до Redis за допомогою бібліотеки redis
//   const redisClient = app.get<RedisClientType>('REDIS_CLIENT'); // 🔹 беремо з DI

//   app.use(cookieParser(config.getOrThrow<string>('COOKIES_SECRET')));

//   app.useGlobalPipes(
//     new ValidationPipe({
//       transform: true,
//     }),
//   );

//   app.enableCors({
//     origin: process.env.ALLOWED_ORIGIN!,
//     credentials: true,
//   });

//   // LOCAL!!!!
//   app.use(
//     session({
//       secret: config.getOrThrow<string>('SESSION_SECRET'),
//       name: config.getOrThrow<string>('SESSION_NAME'), // centrifuge
//       resave: false,
//       saveUninitialized: false,
//       cookie: {
//         httpOnly: true,
//         secure: false, // бо без HTTPS
//         sameSite: 'lax',
//         maxAge: 1000 * 60 * 60 * 24,
//         domain: undefined,
//       },
//       store: new RedisStore({
//         client: redisClient,
//         prefix: config.getOrThrow<string>('SESSION_FOLDER'),
//         ttl: 60 * 60 * 24,
//       }),
//     }),
//   );



//   await app.listen(config.getOrThrow<number>('APPLICATION_PORT'),'0.0.0.0');
// }

// bootstrap();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { RedisClientType } from 'redis';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const redisClient = app.get<RedisClientType>('REDIS_CLIENT');

  const isDev = process.env.NODE_ENV === 'development';

  // Парсер cookie
  app.use(cookieParser(config.getOrThrow<string>('COOKIES_SECRET')));

  // Глобальний ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.ALLOWED_ORIGIN!,
    credentials: true,
  });

  // express-session + Redis
  app.use(
    session({
      name: 'centrifuge', // назва cookie
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      resave: false,
      saveUninitialized: false,
      store: new RedisStore({
        client: redisClient,
        prefix: config.getOrThrow<string>('SESSION_FOLDER'),
        ttl: 60 * 60 * 24, // 1 день
      }),
      cookie: {
        httpOnly: true,
        secure: !isDev, // локально false, продакшн true
        sameSite: isDev ? 'lax' : 'none', // cross-origin тільки на продакшн
        maxAge: 1000 * 60 * 60 * 24, // 1 день
        domain: isDev ? undefined : config.getOrThrow<string>('SESSION_DOMAIN'),
      },
    }),
  );

  await app.listen(config.getOrThrow<number>('APPLICATION_PORT'), '0.0.0.0');
}

bootstrap();
