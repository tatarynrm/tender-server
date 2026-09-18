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
    /** Незавершені завантаження частинами: <uploadId>.part + <uploadId>.json. */
    partsDir: join(root, 'parts'),
    dbFile: join(root, 'trainings.json'),
  };
}

export const TRAINING_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

/**
 * Великі відео вантажаться частинами: один запит на весь файл впирається
 * в ліміт тіла запиту на проксі та в requestTimeout на повільному каналі
 * (на практиці обривалось близько 600MB). Шматок у 32MB проходить за секунди.
 */
export const TRAINING_UPLOAD_CHUNK = 32 * 1024 * 1024; // 32MB

/** Скільки живе незавершене завантаження частинами, перш ніж його прибере крон. */
export const TRAINING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000; // доба

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
