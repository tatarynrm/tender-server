import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';

/**
 * Відео навчання лежать НЕ в uploads/: ту папку роздає useStaticAssets без
 * авторизації, а FileCleanupService щоночі видаляє звідти все, чого немає в
 * таблиці files. storage/ уже в .gitignore, тому git pull при деплої її не чіпає.
 *
 * Шляхи рахуються ліниво: у dev .env підвантажується ConfigModule вже після
 * імпорту цього файлу.
 */
export function getTrainingPaths() {
  const root = resolve(
    process.env.TRAINING_STORAGE_DIR || join(process.cwd(), 'storage', 'training'),
  );
  return {
    root,
    videosDir: join(root, 'videos'),
    dbFile: join(root, 'trainings.json'),
  };
}

export const TRAINING_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

/** Максимальний шматок відео за один Range-запит — файл цілком одним запитом не віддаємо. */
export const TRAINING_STREAM_CHUNK = 8 * 1024 * 1024; // 8MB

/** Скільки живе посилання на стрім. Після спливу плеєр сам бере новий токен. */
export const TRAINING_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 години

export const TRAINING_VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export const trainingMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const { videosDir } = getTrainingPaths();
      mkdirSync(videosDir, { recursive: true });
      cb(null, videosDir);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname || '').toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: TRAINING_MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname || '').toLowerCase();
    if (TRAINING_VIDEO_MIME[ext]) return cb(null, true);
    cb(
      new BadRequestException(
        `Недозволений формат відео: ${file.originalname}. Дозволено: mp4, webm, mov`,
      ),
      false,
    );
  },
};
