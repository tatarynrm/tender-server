import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import { basename, extname, join } from 'path';
import type { Request, Response } from 'express';
import {
  decodeMulterFileName,
  JsonFileStore,
} from 'src/common/json-store/json-file-store';
import {
  getTrainingPaths,
  TRAINING_STREAM_CHUNK,
  TRAINING_TOKEN_TTL_MS,
  TRAINING_VIDEO_MIME,
} from './training.constants';
import {
  ITrainingVideo,
  ITrainingVideoInput,
  ITrainingVideoPublic,
} from './interfaces/training.interface';

/** Sec-Fetch-Dest, з якими відео відкривають напряму, а не в <video>. */
const BLOCKED_FETCH_DEST = new Set(['document', 'iframe', 'frame', 'embed', 'object']);

/** Навчальні відео без БД: метадані — JSON-файл, відео — папка на диску. */
@Injectable()
export class TrainingService implements OnModuleInit {
  private readonly logger = new Logger(TrainingService.name);
  private readonly store = new JsonFileStore<ITrainingVideo[]>(
    () => getTrainingPaths().dbFile,
    () => [],
    (parsed) => {
      // Не масив — помилка, а не порожній список: інакше наступний запис знищить дані
      if (!Array.isArray(parsed)) throw new Error('неочікувана структура trainings.json');
      return parsed;
    },
    TrainingService.name,
  );
  private readonly tokenKey: Buffer;

  constructor(config: ConfigService) {
    this.tokenKey = createHmac('sha256', config.getOrThrow<string>('SESSION_SECRET'))
      .update('training-stream-token')
      .digest();
  }

  async onModuleInit() {
    const { videosDir } = getTrainingPaths();
    await fs.mkdir(videosDir, { recursive: true });
  }

  /** Відео, що лишились після обірваного завантаження (немає в JSON), старші за добу. */
  @Cron('0 50 3 * * *', { timeZone: 'Europe/Kyiv' })
  async cleanupOrphanVideos() {
    const { dbFile, videosDir } = getTrainingPaths();
    try {
      await fs.access(dbFile); // без JSON не знаємо, які відео живі
      const known = new Set((await this.store.read()).map((i) => i.fileName));
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      let removed = 0;

      for (const name of await fs.readdir(videosDir)) {
        if (known.has(name)) continue;
        const stat = await fs.stat(join(videosDir, name)).catch(() => null);
        if (!stat?.isFile() || stat.mtimeMs > cutoff) continue;
        await fs.unlink(join(videosDir, name)).catch(() => undefined);
        removed++;
      }
      if (removed) this.logger.log(`Прибрано осиротілих відео: ${removed}`);
    } catch (e) {
      this.logger.warn(`Прибирання відео пропущено: ${(e as Error).message}`);
    }
  }

  private readAll() {
    return this.store.read();
  }

  private mutate<T>(fn: (items: ITrainingVideo[]) => T | Promise<T>): Promise<T> {
    return this.store.mutate(fn);
  }

  private toPublic({ fileName: _f, ...rest }: ITrainingVideo): ITrainingVideoPublic {
    return rest;
  }

  private cleanText(value: unknown, field: string, max: number, required: boolean) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (required && !text) throw new BadRequestException(`Поле "${field}" обов'язкове`);
    if (text.length > max) {
      throw new BadRequestException(`Поле "${field}" задовге (максимум ${max} символів)`);
    }
    return text;
  }

  private async removeFile(fileName: string) {
    const { videosDir } = getTrainingPaths();
    await fs.unlink(join(videosDir, basename(fileName))).catch((e) => {
      if (e?.code !== 'ENOENT') this.logger.warn(`Не вдалося видалити ${fileName}: ${e.message}`);
    });
  }

  private personName(user: any): string | null {
    const p = user?.person;
    const name = [p?.surname, p?.name].filter(Boolean).join(' ');
    return name || user?.email || null;
  }

  // ---------- CRUD ----------

  async list() {
    const items = await this.readAll();
    const content = items
      .sort(
        (a, b) =>
          a.topic.localeCompare(b.topic, 'uk') ||
          a.order - b.order ||
          a.createdAt.localeCompare(b.createdAt),
      )
      .map((i) => this.toPublic(i));
    return { status: 'ok', content };
  }

  async create(file: Express.Multer.File | undefined, body: ITrainingVideoInput, user: any) {
    if (!file) throw new BadRequestException('Файл відео не передано');

    try {
      const title = this.cleanText(body?.title, 'Назва', 200, true);
      const topic = this.cleanText(body?.topic, 'Тема', 100, true);
      const description = this.cleanText(body?.description, 'Опис', 3000, false);
      const ext = extname(file.filename).toLowerCase();

      const created = await this.mutate((items) => {
        const lastOrder = items
          .filter((i) => i.topic === topic)
          .reduce((max, i) => Math.max(max, i.order), 0);
        const now = new Date().toISOString();
        const item: ITrainingVideo = {
          id: randomUUID(),
          topic,
          title,
          description,
          fileName: file.filename,
          originalName: decodeMulterFileName(file.originalname),
          mimeType: TRAINING_VIDEO_MIME[ext] ?? 'video/mp4',
          size: file.size,
          order: lastOrder + 1,
          createdAt: now,
          updatedAt: now,
          createdBy: this.personName(user),
        };
        items.push(item);
        return item;
      });

      return this.toPublic(created);
    } catch (e) {
      await this.removeFile(file.filename);
      throw e;
    }
  }

  async update(id: string, body: ITrainingVideoInput) {
    const updated = await this.mutate((items) => {
      const item = items.find((i) => i.id === id);
      if (!item) throw new NotFoundException('Відео не знайдено');

      if (body?.title !== undefined) item.title = this.cleanText(body.title, 'Назва', 200, true);
      if (body?.topic !== undefined) item.topic = this.cleanText(body.topic, 'Тема', 100, true);
      if (body?.description !== undefined) {
        item.description = this.cleanText(body.description, 'Опис', 3000, false);
      }
      if (body?.order !== undefined) {
        const order = Number(body.order);
        if (!Number.isFinite(order)) throw new BadRequestException('Некоректний порядок');
        item.order = order;
      }
      item.updatedAt = new Date().toISOString();
      return item;
    });
    return this.toPublic(updated);
  }

  async remove(id: string) {
    const removed = await this.mutate((items) => {
      const index = items.findIndex((i) => i.id === id);
      if (index === -1) throw new NotFoundException('Відео не знайдено');
      return items.splice(index, 1)[0];
    });
    await this.removeFile(removed.fileName);
    return { id };
  }

  // ---------- Токен на перегляд ----------

  private sign(payload: string) {
    return createHmac('sha256', this.tokenKey).update(payload).digest('base64url');
  }

  async createStreamToken(id: string, userId: number) {
    const items = await this.readAll();
    if (!items.some((i) => i.id === id)) throw new NotFoundException('Відео не знайдено');

    const expiresAt = Date.now() + TRAINING_TOKEN_TTL_MS;
    const payload = `${id}|${userId}|${expiresAt}`;
    const token = `${Buffer.from(payload).toString('base64url')}.${this.sign(payload)}`;
    return { token, expiresAt };
  }

  private verifyStreamToken(token: unknown, id: string, userId: number) {
    if (typeof token !== 'string') return false;
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return false;

    const payload = Buffer.from(encoded, 'base64url').toString('utf8');
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

    const [tokenId, tokenUser, exp] = payload.split('|');
    return tokenId === id && Number(tokenUser) === Number(userId) && Number(exp) > Date.now();
  }

  // ---------- Стрім ----------

  async stream(id: string, token: unknown, user: any, req: Request, res: Response) {
    const fetchDest = String(req.headers['sec-fetch-dest'] ?? '').toLowerCase();
    if (BLOCKED_FETCH_DEST.has(fetchDest)) {
      throw new ForbiddenException('Відео доступне лише для перегляду на сторінці навчання');
    }
    if (!this.verifyStreamToken(token, id, user?.id)) {
      throw new ForbiddenException('Посилання на відео недійсне або прострочене');
    }

    const item = (await this.readAll()).find((i) => i.id === id);
    if (!item) throw new NotFoundException('Відео не знайдено');

    const { videosDir } = getTrainingPaths();
    const filePath = join(videosDir, basename(item.fileName));
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) throw new NotFoundException('Файл відео відсутній на сервері');

    // Плеєр браузера завжди шле Range. Без нього — це спроба забрати файл цілком.
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (!match || (match[1] === '' && match[2] === '')) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      throw new HttpException('Потрібен Range-запит', HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
    }

    let start: number;
    let end: number;
    if (match[1] === '') {
      // bytes=-N — останні N байт
      start = Math.max(stat.size - Number(match[2]), 0);
      end = stat.size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === '' ? stat.size - 1 : Number(match[2]);
    }
    end = Math.min(end, stat.size - 1, start + TRAINING_STREAM_CHUNK - 1);

    if (start >= stat.size || start > end) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      throw new HttpException('Некоректний діапазон', HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
    }

    res.status(HttpStatus.PARTIAL_CONTENT);
    res.set({
      'Content-Type': item.mimeType,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-site',
    });

    const fileStream = createReadStream(filePath, { start, end });
    res.on('close', () => fileStream.destroy());
    fileStream.on('error', (err) => {
      this.logger.error(`Помилка читання відео ${item.id}: ${err.message}`);
      res.destroy(err);
    });
    fileStream.pipe(res);
  }
}
