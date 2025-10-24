import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { RedisClientType } from 'redis';
import session from 'express-session';
import { RedisStore } from 'connect-redis';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Додаємо підтримку HTTPS через Nginx
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  const config = app.get(ConfigService);
  const redisClient = app.get<RedisClientType>('REDIS_CLIENT');
  const isDev = process.env.NODE_ENV === 'development';

  app.use(cookieParser(config.getOrThrow<string>('COOKIES_SECRET')));
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  app.enableCors({
    origin: isDev ? 'http://localhost:3000' : 'https://dragan-tataryn.site',
    credentials: true,
  });

  app.use(
    session({
      proxy: true, // ✅ дозволяє secure cookies за проксі
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      name: config.getOrThrow<string>('SESSION_NAME'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: !isDev, // ✅ тільки через HTTPS у продакшні
        sameSite: isDev ? 'lax' : 'none',
        maxAge: 1000 * 60 * 60 * 24 * 30,
        domain: isDev ? undefined : '.dragan-tataryn.site',
      },
      store: new RedisStore({
        client: redisClient,
        prefix: config.getOrThrow<string>('SESSION_FOLDER'),
        ttl: 60 * 60 * 24 * 30,
      }),
    }),
  );

  await app.listen(config.getOrThrow<number>('APPLICATION_PORT'), '0.0.0.0');
}

bootstrap();
