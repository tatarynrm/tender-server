import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, extname, join } from 'path';
import type { Response } from 'express';
import {
  decodeMulterFileName,
  JsonFileStore,
} from 'src/common/json-store/json-file-store';
import {
  DOCUMENT_INLINE_EXT,
  DOCUMENT_MIME,
  DOCUMENTS_MAX_FOLDER_DEPTH,
  getDocumentsPaths,
} from './documents.constants';
import {
  IDocFile,
  IDocFilePublic,
  IDocFolder,
  IDocumentsDb,
} from './interfaces/documents.interface';

const FORBIDDEN_NAME_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

/**
 * Файловий менеджер документів ICT без БД:
 * структура папок і метадані — storage/documents/documents.json,
 * самі файли — storage/documents/files/<uuid>.<ext>.
 */
@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly store = new JsonFileStore<IDocumentsDb>(
    () => getDocumentsPaths().dbFile,
    () => ({ version: 1, folders: [], files: [] }),
    (parsed: any) => ({
      version: 1,
      folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
      files: Array.isArray(parsed?.files) ? parsed.files : [],
    }),
    DocumentsService.name,
  );

  async onModuleInit() {
    await fs.mkdir(getDocumentsPaths().filesDir, { recursive: true });
  }

  // ---------- helpers ----------

  private toPublic({ storedName: _s, ...rest }: IDocFile): IDocFilePublic {
    return rest;
  }

  private personName(user: any): string | null {
    const p = user?.person;
    return [p?.surname, p?.name].filter(Boolean).join(' ') || user?.email || null;
  }

  /** Прибирає заборонені для файлових систем символи й керівні коди. */
  private cleanName(value: unknown, what: string) {
    const raw = typeof value === 'string' ? value : '';
    const name = [...raw]
      .filter((ch) => ch.charCodeAt(0) >= 32 && !FORBIDDEN_NAME_CHARS.has(ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, ''); // Windows не любить крапку/пробіл у кінці

    if (!name || name === '.' || name === '..') {
      throw new BadRequestException(`Некоректна назва ${what}`);
    }
    if (name.length > 200) {
      throw new BadRequestException(`Назва ${what} задовга (максимум 200 символів)`);
    }
    return name;
  }

  private sameName(a: string, b: string) {
    return a.localeCompare(b, 'uk', { sensitivity: 'accent' }) === 0;
  }

  private assertFolder(db: IDocumentsDb, folderId: string | null) {
    if (folderId === null) return null;
    const folder = db.folders.find((f) => f.id === folderId);
    if (!folder) throw new NotFoundException('Папку не знайдено');
    return folder;
  }

  private normalizeFolderId(value: unknown): string | null {
    if (value === undefined || value === null || value === '' || value === 'null') return null;
    if (typeof value !== 'string') throw new BadRequestException('Некоректна папка');
    return value;
  }

  private folderDepth(db: IDocumentsDb, folderId: string | null) {
    let depth = 0;
    let current = folderId;
    while (current) {
      depth++;
      current = db.folders.find((f) => f.id === current)?.parentId ?? null;
      if (depth > 100) break; // захист від циклу в пошкодженому JSON
    }
    return depth;
  }

  private descendantFolderIds(db: IDocumentsDb, rootId: string) {
    const ids = new Set([rootId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of db.folders) {
        if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
          ids.add(f.id);
          added = true;
        }
      }
    }
    return ids;
  }

  /** «Звіт.pdf» → «Звіт (1).pdf», якщо ім'я вже зайняте в папці. */
  private uniqueFileName(db: IDocumentsDb, folderId: string | null, name: string, exceptId?: string) {
    const taken = db.files
      .filter((f) => f.folderId === folderId && f.id !== exceptId)
      .map((f) => f.name);
    if (!taken.some((t) => this.sameName(t, name))) return name;

    const ext = extname(name);
    const stem = ext ? name.slice(0, -ext.length) : name;
    for (let i = 1; ; i++) {
      const candidate = `${stem} (${i})${ext}`;
      if (!taken.some((t) => this.sameName(t, candidate))) return candidate;
    }
  }

  private findSiblingFolder(db: IDocumentsDb, parentId: string | null, name: string, exceptId?: string) {
    return db.folders.find(
      (f) => f.parentId === parentId && f.id !== exceptId && this.sameName(f.name, name),
    );
  }

  private async unlinkStored(storedNames: string[]) {
    const { filesDir } = getDocumentsPaths();
    await Promise.all(
      storedNames.map((name) =>
        fs.unlink(join(filesDir, basename(name))).catch((e) => {
          if (e?.code !== 'ENOENT') this.logger.warn(`Не вдалося видалити ${name}: ${e.message}`);
        }),
      ),
    );
  }

  // ---------- читання ----------

  async getTree() {
    const db = await this.store.read();
    return {
      status: 'ok',
      content: {
        folders: db.folders,
        files: db.files.map((f) => this.toPublic(f)),
      },
    };
  }

  // ---------- папки ----------

  async createFolder(body: any, user: any) {
    const name = this.cleanName(body?.name, 'папки');
    const parentId = this.normalizeFolderId(body?.parentId);

    return this.store.mutate((db) => {
      this.assertFolder(db, parentId);
      if (this.folderDepth(db, parentId) >= DOCUMENTS_MAX_FOLDER_DEPTH) {
        throw new BadRequestException('Забагато рівнів вкладеності папок');
      }
      if (this.findSiblingFolder(db, parentId, name)) {
        throw new ConflictException(`Папка «${name}» тут уже існує`);
      }
      const now = new Date().toISOString();
      const folder: IDocFolder = {
        id: randomUUID(),
        parentId,
        name,
        createdAt: now,
        updatedAt: now,
        createdBy: this.personName(user),
      };
      db.folders.push(folder);
      return folder;
    });
  }

  async updateFolder(id: string, body: any) {
    return this.store.mutate((db) => {
      const folder = this.assertFolder(db, id)!;
      const name = body?.name !== undefined ? this.cleanName(body.name, 'папки') : folder.name;
      const parentId =
        body?.parentId !== undefined ? this.normalizeFolderId(body.parentId) : folder.parentId;

      if (parentId !== folder.parentId) {
        this.assertFolder(db, parentId);
        if (parentId && this.descendantFolderIds(db, id).has(parentId)) {
          throw new BadRequestException('Не можна перемістити папку всередину самої себе');
        }
        const subtreeDepth = this.subtreeHeight(db, id);
        if (this.folderDepth(db, parentId) + subtreeDepth > DOCUMENTS_MAX_FOLDER_DEPTH) {
          throw new BadRequestException('Забагато рівнів вкладеності папок');
        }
      }
      if (this.findSiblingFolder(db, parentId, name, id)) {
        throw new ConflictException(`Папка «${name}» там уже існує`);
      }

      folder.name = name;
      folder.parentId = parentId;
      folder.updatedAt = new Date().toISOString();
      return folder;
    });
  }

  private subtreeHeight(db: IDocumentsDb, id: string): number {
    const children = db.folders.filter((f) => f.parentId === id);
    return 1 + Math.max(0, ...children.map((c) => this.subtreeHeight(db, c.id)));
  }

  async deleteFolder(id: string) {
    const removed = await this.store.mutate((db) => {
      this.assertFolder(db, id);
      const ids = this.descendantFolderIds(db, id);
      const files = db.files.filter((f) => f.folderId && ids.has(f.folderId));
      db.folders = db.folders.filter((f) => !ids.has(f.id));
      db.files = db.files.filter((f) => !(f.folderId && ids.has(f.folderId)));
      return { folders: ids.size, files };
    });
    await this.unlinkStored(removed.files.map((f) => f.storedName));
    return { id, deletedFolders: removed.folders, deletedFiles: removed.files.length };
  }

  // ---------- файли ----------

  /**
   * Завантаження кількох файлів. `paths` — JSON-масив відносних шляхів у тому ж
   * порядку, що й files (для перетягнутих папок: «Компанія/Виписка.pdf»).
   * Проміжні папки створюються або перевикористовуються за назвою.
   */
  async upload(files: Express.Multer.File[] | undefined, body: any, user: any) {
    if (!files?.length) throw new BadRequestException('Файли не передано');

    try {
      const targetId = this.normalizeFolderId(body?.folderId);
      let paths: unknown[] = [];
      if (body?.paths) {
        try {
          const parsed = JSON.parse(body.paths);
          if (Array.isArray(parsed) && parsed.length === files.length) paths = parsed;
        } catch {
          throw new BadRequestException('Некоректний список шляхів');
        }
      }

      return await this.store.mutate((db) => {
        this.assertFolder(db, targetId);
        const now = new Date().toISOString();
        const createdBy = this.personName(user);
        const created: IDocFilePublic[] = [];
        let createdFolders = 0;

        files.forEach((file, index) => {
          const rel = typeof paths[index] === 'string' ? (paths[index] as string) : '';
          const segments = rel.split(/[\\/]/).filter((s) => s && s !== '.');
          const fileName = this.cleanName(
            segments.length ? segments[segments.length - 1] : decodeMulterFileName(file.originalname),
            'файлу',
          );

          let folderId = targetId;
          for (const segment of segments.slice(0, -1)) {
            const dirName = this.cleanName(segment, 'папки');
            let folder = this.findSiblingFolder(db, folderId, dirName);
            if (!folder) {
              if (this.folderDepth(db, folderId) >= DOCUMENTS_MAX_FOLDER_DEPTH) {
                throw new BadRequestException('Забагато рівнів вкладеності папок');
              }
              folder = {
                id: randomUUID(),
                parentId: folderId,
                name: dirName,
                createdAt: now,
                updatedAt: now,
                createdBy,
              };
              db.folders.push(folder);
              createdFolders++;
            }
            folderId = folder.id;
          }

          const ext = extname(file.filename).toLowerCase();
          const doc: IDocFile = {
            id: randomUUID(),
            folderId,
            name: this.uniqueFileName(db, folderId, fileName),
            storedName: file.filename,
            mimeType: DOCUMENT_MIME[ext] ?? 'application/octet-stream',
            size: file.size,
            createdAt: now,
            updatedAt: now,
            createdBy,
          };
          db.files.push(doc);
          created.push(this.toPublic(doc));
        });

        return { files: created, createdFolders };
      });
    } catch (e) {
      await this.unlinkStored(files.map((f) => f.filename));
      throw e;
    }
  }

  async updateFile(id: string, body: any) {
    const updated = await this.store.mutate((db) => {
      const file = db.files.find((f) => f.id === id);
      if (!file) throw new NotFoundException('Файл не знайдено');

      const folderId =
        body?.folderId !== undefined ? this.normalizeFolderId(body.folderId) : file.folderId;
      this.assertFolder(db, folderId);

      let name = file.name;
      if (body?.name !== undefined) {
        name = this.cleanName(body.name, 'файлу');
        // Розширення не губимо — від нього залежать тип і перегляд
        const originalExt = extname(file.storedName).toLowerCase();
        if (originalExt && extname(name).toLowerCase() !== originalExt) name += originalExt;
      }

      const clash = db.files.some(
        (f) => f.folderId === folderId && f.id !== id && this.sameName(f.name, name),
      );
      if (clash && body?.name !== undefined) {
        throw new ConflictException(`Файл «${name}» там уже існує`);
      }
      file.name = clash ? this.uniqueFileName(db, folderId, name, id) : name;
      file.folderId = folderId;
      file.updatedAt = new Date().toISOString();
      return file;
    });
    return this.toPublic(updated);
  }

  async deleteFile(id: string) {
    const removed = await this.store.mutate((db) => {
      const index = db.files.findIndex((f) => f.id === id);
      if (index === -1) throw new NotFoundException('Файл не знайдено');
      return db.files.splice(index, 1)[0];
    });
    await this.unlinkStored([removed.storedName]);
    return { id };
  }

  // ---------- віддача файлу ----------

  private contentDisposition(type: 'inline' | 'attachment', name: string) {
    const fallback = [...name]
      .map((ch) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 127 && ch !== '"' ? ch : '_'))
      .join('');
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) =>
      `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
  }

  async sendFile(id: string, mode: 'view' | 'download', res: Response) {
    const db = await this.store.read();
    const file = db.files.find((f) => f.id === id);
    if (!file) throw new NotFoundException('Файл не знайдено');

    const { filesDir } = getDocumentsPaths();
    const absPath = join(filesDir, basename(file.storedName));
    const exists = await fs.stat(absPath).catch(() => null);
    if (!exists) throw new NotFoundException('Файл відсутній на сервері');

    const ext = extname(file.storedName).toLowerCase();
    const inline = mode === 'view' && DOCUMENT_INLINE_EXT.has(ext);

    res.sendFile(
      absPath,
      {
        headers: {
          'Content-Type': file.mimeType || 'application/octet-stream',
          'Content-Disposition': this.contentDisposition(inline ? 'inline' : 'attachment', file.name),
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-cache',
        },
      },
      (err) => {
        if (err && !res.headersSent) {
          this.logger.error(`Не вдалося віддати файл ${id}: ${err.message}`);
          res.status(500).end();
        }
      },
    );
  }
}
