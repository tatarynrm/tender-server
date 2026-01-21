import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

@Injectable()
export class FileCleanupService {
  private readonly logger = new Logger(FileCleanupService.name);
  private readonly projectRoot = process.cwd();
  private readonly absoluteUploadPath = path.resolve(
    this.projectRoot,
    'uploads',
  );
  private isRunning = false; // Захист від накладання запусків

  constructor(@Inject('PG_POOL') private db: Pool) {}

  @Cron('0 0 2 * * *', { timeZone: 'Europe/Kyiv' }) // Краще раз на добу вночі
  //   @Cron('*/10 * * * * *', { timeZone: 'Europe/Kyiv' }) //Кожних 10 секунд
  async handleFileCleanup() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.logger.log('--- Starting Heavy Cleanup (Optimized for 1M+ files) ---');

    try {
      // 1. Завантажуємо БД у Set (це найшвидший спосіб порівняння)
      // Для 1 млн записів це прийнятно для пам'яті
      const result = await this.db.query('SELECT file_url FROM files');
      const dbFilePaths = new Set(
        result.rows.map((f) => {
          const url = String(f.file_url);
          return (url.startsWith('/') ? url.substring(1) : url).replace(
            /\\/g,
            '/',
          );
        }),
      );

      let deletedCount = 0;
      let totalChecked = 0;
      const now = Date.now();
      const MIN_AGE = 10 * 1000;

      // 2. Використовуємо генератор для обходу диска без переповнення пам'яті
      for (const fullPath of this.walkSync(this.absoluteUploadPath)) {
        totalChecked++;
        const relativeToRoot = path
          .relative(this.projectRoot, fullPath)
          .replace(/\\/g, '/');

        if (!dbFilePaths.has(relativeToRoot)) {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > MIN_AGE) {
            fs.unlinkSync(fullPath);
            deletedCount++;
          }
        }

        // Логування кожні 10 000 файлів, щоб бачити прогрес
        if (totalChecked % 10000 === 0) {
          this.logger.log(`Progress: checked ${totalChecked} files...`);
        }
      }

      this.logger.log(
        `Cleanup finished. Checked: ${totalChecked}, Deleted: ${deletedCount}`,
      );
    } catch (error) {
      this.logger.error('Cleanup failed', error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  // ГЕНЕРАТОР: Не створює масив, а видає по одному файлу (дуже економить RAM)
  private *walkSync(dir: string): IterableIterator<string> {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const res = path.join(dir, file.name);
      if (file.isDirectory()) {
        yield* this.walkSync(res);
      } else {
        yield res;
      }
    }
  }
}
