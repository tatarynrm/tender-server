import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { RedisClientType } from 'redis';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import * as express from 'express';
import { RedisIoAdapter } from './libs/common/adapters/redis-io.adapter';
import { json, urlencoded } from 'express'; // Додай ці імпорти
// ✅ ПРАВИЛЬНИЙ ІМПОРТ
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path'; // Додайте цей іпорт для join
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

async function bootstrap() {
  // ✅ Generic вказано вірно
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Конфігурація документації
  const configSwagger = new DocumentBuilder()
    .setTitle('ICT NEW TENDER PLATFORM ALL IN ONE')
    .setDescription('Документація API для логістичної системи')
    .setVersion('1.0')
    // .addTag('admin') // Можна додати теги для групування
    // .addBearerAuth() // Якщо використовуєте JWT авторизацію
    .build();

  const document = SwaggerModule.createDocument(app, configSwagger);

  // Шлях, за яким буде доступна документація (наприклад, http://localhost:7000/docs)
  SwaggerModule.setup('noris-docs', app, document);
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  const config = app.get(ConfigService);
  const redisClient = app.get<RedisClientType>('REDIS_CLIENT');
  const isDev = process.env.NODE_ENV === 'development';

  app.use(cookieParser(config.getOrThrow<string>('COOKIES_SECRET')));
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, forbidNonWhitelisted: true }),
  );

  app.enableCors({
    origin: ['https://tender.ict.lviv.ua', 'http://localhost:3000'],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Pragma',
      'Cache-Control',
      'Expires',
    ],
  });

  app.use(
    session({
      proxy: true,
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      name: config.getOrThrow<string>('SESSION_NAME'),
      resave: true,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: !isDev,
        sameSite: isDev ? 'lax' : 'none',
        maxAge: THIRTY_DAYS,
        domain: isDev ? undefined : '.ict.lviv.ua',
      },
      store: new RedisStore({
        client: redisClient,
        prefix: config.getOrThrow<string>('SESSION_FOLDER'),
        ttl: THIRTY_DAYS_SECONDS,
      }),
    }),
  );

  // ✅ ЗБІЛЬШУЄМО ЛІМІТИ ТУТ:
  // Замість звичайного app.use(express.json()) робимо так:
  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ limit: '100mb', extended: true }));
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // ✅ ВИПРАВЛЕНО ТУТ: повна назва методу та коректний шлях
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(config.getOrThrow<number>('APPLICATION_PORT'), '0.0.0.0');

  // getCity logic...
}

bootstrap();
