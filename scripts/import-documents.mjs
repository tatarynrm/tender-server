#!/usr/bin/env node
/**
 * Разовий імпорт локальної папки з документами у файловий менеджер /log/files.
 *
 *   node scripts/import-documents.mjs "<шлях до папки>" [--into="Назва кореневої папки"]
 *
 * Структура вкладених папок зберігається. Без --into створюється коренева папка з
 * назвою вихідної. Уже наявні папки з тією ж назвою перевикористовуються, файли з
 * однаковою назвою в тій самій папці пропускаються (повторний запуск безпечний).
 *
 * Формат і шляхи мають збігатися з src/documents (documents.constants.ts).
 * Запускати з папки server-ai. Бажано при зупиненому бекенді, щоб не перетнутись
 * із записом через UI.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.txt': 'text/plain; charset=utf-8',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.csv': 'text/csv; charset=utf-8',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.p7s': 'application/pkcs7-signature',
  '.asice': 'application/vnd.etsi.asic-e+zip',
  '.sig': 'application/octet-stream',
  '.xml': 'application/xml',
  '.eml': 'message/rfc822',
  '.msg': 'application/vnd.ms-outlook',
};

const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith('--'));
const intoArg = args.find((a) => a.startsWith('--into='));
if (!source || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  console.error('Вкажіть існуючу папку: node scripts/import-documents.mjs "<шлях>" [--into="Назва"]');
  process.exit(1);
}

const root = path.resolve(
  process.env.DOCUMENTS_STORAGE_DIR || path.join(process.cwd(), 'storage', 'documents'),
);
const filesDir = path.join(root, 'files');
const dbFile = path.join(root, 'documents.json');
fs.mkdirSync(filesDir, { recursive: true });

const db = fs.existsSync(dbFile)
  ? JSON.parse(fs.readFileSync(dbFile, 'utf8'))
  : { version: 1, folders: [], files: [] };
db.folders ??= [];
db.files ??= [];

const now = new Date().toISOString();
const same = (a, b) => a.localeCompare(b, 'uk', { sensitivity: 'accent' }) === 0;
const stats = { folders: 0, files: 0, skipped: 0, unsupported: [] };

function ensureFolder(parentId, name) {
  let folder = db.folders.find((f) => f.parentId === parentId && same(f.name, name));
  if (!folder) {
    folder = { id: randomUUID(), parentId, name, createdAt: now, updatedAt: now, createdBy: 'Імпорт' };
    db.folders.push(folder);
    stats.folders++;
  }
  return folder.id;
}

function walk(dir, folderId) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'uk', { numeric: true }));

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, ensureFolder(folderId, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!MIME[ext]) {
      stats.unsupported.push(path.relative(source, full));
      continue;
    }
    if (db.files.some((f) => f.folderId === folderId && same(f.name, entry.name))) {
      stats.skipped++;
      continue;
    }
    const storedName = `${randomUUID()}${ext}`;
    fs.copyFileSync(full, path.join(filesDir, storedName));
    db.files.push({
      id: randomUUID(),
      folderId,
      name: entry.name,
      storedName,
      mimeType: MIME[ext],
      size: fs.statSync(full).size,
      createdAt: now,
      updatedAt: now,
      createdBy: 'Імпорт',
    });
    stats.files++;
  }
}

const rootName = intoArg ? intoArg.slice('--into='.length).replace(/^"|"$/g, '') : path.basename(path.resolve(source));
walk(source, ensureFolder(null, rootName));

const tmp = `${dbFile}.import.tmp`;
fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
fs.renameSync(tmp, dbFile);

console.log(`Готово: папок створено ${stats.folders}, файлів імпортовано ${stats.files}, пропущено дублікатів ${stats.skipped}`);
if (stats.unsupported.length) {
  console.log(`Непідтримувані типи (не імпортовані): ${stats.unsupported.length}`);
  stats.unsupported.forEach((f) => console.log(`  - ${f}`));
}
