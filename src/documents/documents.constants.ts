import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';

/**
 * Документи ICT лежать у storage/documents, а НЕ в uploads/ (роздається публічно
 * й чиститься кроном) і не в public/ фронта (доступний усім без входу).
 * Шляхи ліниві — у dev .env підвантажується вже після імпорту файлу.
 */
export function getDocumentsPaths() {
  const root = resolve(
    process.env.DOCUMENTS_STORAGE_DIR || join(process.cwd(), 'storage', 'documents'),
  );
  return {
    root,
    filesDir: join(root, 'files'),
    dbFile: join(root, 'documents.json'),
  };
}

/** Слово, яке треба ввести для підтвердження видалення. */
export const DELETE_CONFIRM_WORD = 'ICT';

// На українській розкладці «ІСТ» набирається кирилицею й виглядає так само.
const CYRILLIC_LOOKALIKES: Record<string, string> = { 'І': 'I', 'С': 'C', 'Т': 'T' };

export function isDeleteConfirmed(value: unknown) {
  if (typeof value !== 'string') return false;
  const normalized = [...value.trim().toUpperCase()]
    .map((ch) => CYRILLIC_LOOKALIKES[ch] ?? ch)
    .join('');
  return normalized === DELETE_CONFIRM_WORD;
}

export const DOCUMENTS_MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB на файл
export const DOCUMENTS_MAX_FILES_PER_UPLOAD = 200;
export const DOCUMENTS_MAX_FOLDER_DEPTH = 15;

export const DOCUMENT_MIME: Record<string, string> = {
  // документи
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.txt': 'text/plain; charset=utf-8',
  // таблиці
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.csv': 'text/csv; charset=utf-8',
  // презентації
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // архіви
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  // зображення / скани
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  // КЕП / підписи / листи
  '.p7s': 'application/pkcs7-signature',
  '.asice': 'application/vnd.etsi.asic-e+zip',
  '.sig': 'application/octet-stream',
  '.xml': 'application/xml',
  '.eml': 'message/rfc822',
  '.msg': 'application/vnd.ms-outlook',
};

/**
 * Типи, які безпечно показувати в браузері прямо з домену бекенда.
 * HTML/SVG/XML сюди не додавати — це XSS на origin API.
 */
export const DOCUMENT_INLINE_EXT = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.txt',
]);

export const documentsMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const { filesDir } = getDocumentsPaths();
      mkdirSync(filesDir, { recursive: true });
      cb(null, filesDir);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname || '').toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: DOCUMENTS_MAX_FILE_SIZE,
    files: DOCUMENTS_MAX_FILES_PER_UPLOAD,
  },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname || '').toLowerCase();
    if (DOCUMENT_MIME[ext]) return cb(null, true);
    cb(
      new BadRequestException(
        `Недозволений тип файлу: ${ext || 'без розширення'}. Дозволено документи, таблиці, архіви, скани, КЕП`,
      ),
      false,
    );
  },
};
