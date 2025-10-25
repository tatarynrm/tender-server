import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { RedisClientType } from 'redis';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30; // 30 днів у мс
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30; // 30 днів у секундах
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
    proxy: true,
    secret: config.getOrThrow<string>('SESSION_SECRET'),
    name: config.getOrThrow<string>('SESSION_NAME'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: !isDev, // HTTPS only у проді
      sameSite: isDev ? 'lax' : 'none',
      maxAge: THIRTY_DAYS, // 🕒 30 днів
      domain: isDev ? undefined : '.dragan-tataryn.site',
    },
    store: new RedisStore({
      client: redisClient,
      prefix: config.getOrThrow<string>('SESSION_FOLDER'),
      ttl: THIRTY_DAYS_SECONDS, // 🕒 30 днів
    }),
  }),
);
  await app.listen(config.getOrThrow<number>('APPLICATION_PORT'), '0.0.0.0');
}

bootstrap();
