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
import * as argon2 from 'argon2';
import { Pool } from 'pg';
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
// 2. Отримуємо PG_POOL з контейнера NestJS
//   const pool = app.get<Pool>('PG_POOL'); 

//   // 3. Викликаємо міграцію
//   await runMigration(pool);
//  // Функція міграції
// async function runMigration(pool: Pool) {
//   const usersRawData = [
//     { email: 'vom@ict.lviv.ua', password: 'Vom34wd' },
//     { email: 'rs@ict.lviv.ua', password: 'Kptbvc' },
//     { email: 'vr@ict.lviv.ua', password: 'B78orbf' },
//     { email: 'gt@ict.lviv.ua', password: 'm93vjKng' },
//     { email: 'no@ict.lviv.ua', password: 'imv34onS' },
//     { email: 'oz@ict.lviv.ua', password: 'Hjkquib41' },
//     { email: 'ms@ict.lviv.ua', password: 'wumrcO92' },
//     { email: 'vk@ict.lviv.ua', password: 'Bzdlg21' },
//     { email: 'lg@ict.lviv.ua', password: 'PcVBN21' },
//     { email: 'ssm@ict.lviv.ua', password: 'Hnb45Edc' },
//     { email: 'ar@ict.lviv.ua', password: 'Fdfglf' },
//     { email: 'sr@ict.lviv.ua', password: 'Nx97djks' },
//     { email: 'ss@ict.lviv.ua', password: 'gtfwnv15Z' },
//     { email: 'sts@ict.lviv.ua', password: 'Tsv94Gvd' },
//     { email: 'ac@ict.lviv.ua', password: 'Gmsvtdi61' },
//     { email: 'rt@ict.lviv.ua', password: 'Rt45Dcv2' },
//     { email: 'yt@ict.lviv.ua', password: 'Sdc45Rfd' },
//     { email: 'ip@ict.lviv.ua', password: 'Asd67Cxz' },
//     { email: 'osv@ict.lviv.ua', password: 'Btrsdf31' },
//     { email: 'vg@ict.lviv.ua', password: 'Nmtsf21' },
//     { email: 'nn@ict.lviv.ua', password: 'Vftd34bhp' },
//     { email: 'mo@ict.lviv.ua', password: 'Erf23Fvc' },
//     { email: 'cs@ict.lviv.ua', password: 'B6ftrsp' },
//     { email: 'sho@ict.lviv.ua', password: 'Vtsd42hn' },
//     { email: 'svv@ict.lviv.ua', password: 'Tkdr911Rdb' },
//     { email: 'bv@ict.lviv.ua', password: 'Asc34tgv' },
//     { email: 'bti@ict.lviv.ua', password: 'Bti78Xcd' },
//     { email: 'im@ict.lviv.ua', password: 'Wer51sDc' },
//     { email: 'ot@ict.lviv.ua', password: 'Ad22uk12' },
//     { email: 'cov@ict.lviv.ua', password: 'Sde23Ujn' },
//     { email: 'jsr@ict.lviv.ua', password: 'Sxc34Eds' },
//     { email: 'pm@ict.lviv.ua', password: 'mnb45asd' },
//     { email: 'ubs@ict.lviv.ua', password: 'Usb098DnA' },
//     { email: 'szu@ict.lviv.ua', password: 'Szu56Sd34' },
//     { email: 'amv@ict.lviv.ua', password: 'Rfc53mnb' },
//     { email: 'abm@ict.lviv.ua', password: 'Qwe12Asd' }
//   ];

//   try {
//     console.log(`[Migration] Перевірка паролів...`);

//     for (const data of usersRawData) {
//       // Хешуємо пароль
//       const hash = await argon2.hash(data.password);

//       // Оновлюємо тільки ті записи, де ще стоїть плейсхолдер 'HASH_HERE'
//       const result = await pool.query(
//         `UPDATE usr 
//          SET password_hash = $1 
//          WHERE email = $2 AND password_hash = 'HASH_HERE'`,
//         [hash, data.email],
//       );

   
//     }

//     console.log('[Migration] Готово.');
//   } catch (err) {
//     console.error('[Migration] Помилка:', err);
//   }
// }
 
}

bootstrap();
