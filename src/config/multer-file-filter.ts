import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

/**
 * Спільний fileFilter для всіх аплоадів. Пропускає файл, якщо його MIME-тип
 * або розширення у білому списку — так покриваємо і випадки, коли браузер шле
 * xlsx/docx як application/octet-stream (тоді рятує перевірка розширення), і
 * відкидаємо небезпечні типи (.exe, .js, .sh, .bat, архіви тощо).
 */
const ALLOWED_EXT = new Set([
  // зображення
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.bmp',
  // документи
  '.pdf', '.doc', '.docx',
  // таблиці
  '.xlsx', '.xls', '.csv',
  // аудіо (голосові з браузера/телефону)
  '.mp3', '.wav', '.ogg', '.oga', '.webm', '.m4a', '.aac', '.3gp', '.mp4',
]);

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv', 'application/csv',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
  'audio/mp4', 'audio/aac', 'audio/3gpp', 'audio/x-m4a', 'video/webm', 'video/mp4',
]);

export function multerFileFilter(
  _req: any,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname || '').toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) || ALLOWED_EXT.has(ext)) {
    return cb(null, true);
  }
  cb(
    new BadRequestException(`Недозволений тип файлу: ${file.originalname}`),
    false,
  );
}

/** Реальний ліміт розміру аплоаду — 30MB (було 100MB). */
export const MULTER_LIMITS = { fileSize: 30 * 1024 * 1024 };
