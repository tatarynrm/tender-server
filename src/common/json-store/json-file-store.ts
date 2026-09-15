import { InternalServerErrorException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname } from 'path';

/**
 * JSON-файл як маленька «база» для даних, які свідомо не йдуть у Postgres
 * (навчальні відео, документи ICT).
 *
 * - записи серіалізуються через чергу — одночасні збереження не затирають одне одного;
 * - файл пишеться через temp + rename, тож читач ніколи не побачить половину JSON;
 * - пошкоджений файл не підміняється порожнім значенням, інакше наступний запис знищить дані.
 *
 * Черга живе в пам'яті процесу: при кількох інстансах (pm2 cluster) гарантії немає.
 */
export class JsonFileStore<T> {
  private readonly logger: Logger;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly getFilePath: () => string,
    private readonly createEmpty: () => T,
    private readonly normalize: (parsed: unknown) => T,
    loggerContext: string,
  ) {
    this.logger = new Logger(loggerContext);
  }

  async read(): Promise<T> {
    const file = this.getFilePath();
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch (e: any) {
      if (e?.code === 'ENOENT') return this.createEmpty();
      throw e;
    }
    try {
      return this.normalize(JSON.parse(raw));
    } catch (e) {
      this.logger.error(`Пошкоджений ${file}: ${(e as Error).message}`);
      throw new InternalServerErrorException('Файл даних пошкоджений');
    }
  }

  mutate<R>(fn: (data: T) => R | Promise<R>): Promise<R> {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const result = await fn(data);
      await this.write(data);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(data: T) {
    const file = this.getFilePath();
    await fs.mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }
}

/** busboy віддає ім'я файлу в latin1 — кирилиця приходить кракозябрами. */
export function decodeMulterFileName(name: string) {
  if ([...name].some((ch) => ch.charCodeAt(0) > 255)) return name; // уже декодоване
  return Buffer.from(name, 'latin1').toString('utf8');
}
