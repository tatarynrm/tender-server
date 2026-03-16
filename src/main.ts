import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { RedisClientType } from 'redis';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { loggerConfig } from './libs/common/logger/logger.config';
import { RedisIoAdapter } from './libs/common/adapters/redis-io.adapter';
import { existsSync, mkdirSync } from 'fs';

const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: loggerConfig,
  });

  const config = app.get(ConfigService);
  const isDev = config.get<string>('NODE_ENV') === 'development';

  const configSwagger = new DocumentBuilder()
    .setTitle('ICT TENDER PLATFORM')
    .setDescription('API Documentation for Logistics System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, configSwagger);
  SwaggerModule.setup('noris-docs', app, document);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  const redisClient = app.get<RedisClientType>('REDIS_CLIENT');

  app.use(cookieParser(config.getOrThrow<string>('COOKIES_SECRET')));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const allowedOrigins = config.get<string>('ALLOWED_ORIGINS')?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://tender.ict.lviv.ua'
  ];

  app.enableCors({
    origin: allowedOrigins,
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
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: !isDev, // true на продакшені (HTTPS), false локально
        sameSite: isDev ? 'lax' : 'none', // 'none' дозволяє крос-доменні куки
        maxAge: THIRTY_DAYS,
        domain: isDev ? 'localhost' : '.ict.lviv.ua',
      },
      store: new RedisStore({
        client: redisClient,
        prefix: config.getOrThrow<string>('SESSION_FOLDER'),
        ttl: THIRTY_DAYS_SECONDS,
      }),
    }),
  );

  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ limit: '100mb', extended: true }));

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const uploadDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }

  // 2. Роздаємо статику
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
  });

  const port = config.get<number>('APPLICATION_PORT') || 7000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();