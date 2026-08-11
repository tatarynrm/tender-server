import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseOracleService } from './database-oracle.service';

const SCHEMA_OWNER = 'ICTDAT';
const SNAPSHOT_VERSION = 1;
const HISTORY_LIMIT = 100;

export interface OracleTableDoc {
  name: string;
  comment: string | null;
  columns: {
    name: string;
    dataType: string;
    nullable: boolean;
    comment: string | null;
  }[];
  foreignKeys: {
    constraintName: string;
    columns: string;
    parentTable: string;
    parentColumns: string;
  }[];
  referencedBy: string[];
}

export interface OraclePlsqlDoc {
  name: string;
  type: string;
  status: string;
  lastDdlTime: string;
  arguments: {
    name: string | null;
    position: number;
    dataType: string | null;
    inOut: string;
    packageName: string | null;
  }[];
}

export interface OracleSchemaSnapshot {
  version: number;
  generatedAt: string;
  fingerprint: string;
  counts: Record<string, number>;
  tables: OracleTableDoc[];
  plsql: OraclePlsqlDoc[];
  views: { name: string }[];
  indexes: { name: string; table: string; unique: boolean }[];
  history: {
    at: string;
    trigger: string;
    changes: string[];
  }[];
}

export interface SnapshotMeta {
  generatedAt: string;
  fingerprint: string;
  counts: Record<string, number>;
  lastCheckAt: string;
  lastTrigger: string;
}

/**
 * Стежить за схемою ICTDAT в Oracle: звіряє «відбиток» схеми (лічильники +
 * MAX(LAST_DDL_TIME) по типах об'єктів); повний збір метаданих і регенерація
 * документації запускаються лише коли відбиток змінився, тому регулярна
 * перевірка — це один швидкий запит.
 *
 * Сам аналіз не запускається автоматично — ні на старті сервера, ні за
 * розкладом. Оновлення лише вручну через `POST /oracle/docs/refresh`.
 *
 * Снапшот зберігається локально в storage/oracle-docs/schema-snapshot.enc,
 * зашифрований AES-256-GCM ключем зі змінної ORACLE_DOCS_SECRET. Поруч лежить
 * snapshot-meta.json без чутливих даних (тільки лічильники й хеш) — для швидкої
 * звірки без розшифрування.
 */
@Injectable()
export class OracleSchemaDocsService {
  private readonly logger = new Logger(OracleSchemaDocsService.name);

  private readonly storageDir = path.join(
    process.cwd(),
    'storage',
    'oracle-docs',
  );
  private readonly snapshotFile = path.join(
    this.storageDir,
    'schema-snapshot.enc',
  );
  private readonly metaFile = path.join(this.storageDir, 'snapshot-meta.json');

  private isRunning = false;
  private cached: OracleSchemaSnapshot | null = null;

  constructor(private readonly oracle: DatabaseOracleService) {}

  private get secret(): string | undefined {
    return process.env.ORACLE_DOCS_SECRET || undefined;
  }

  /**
   * Головний цикл: швидкий відбиток → якщо збігається з збереженим, виходимо;
   * якщо ні — повний збір, диф проти старого снапшота, шифрований запис.
   */
  async checkAndUpdate(trigger: string): Promise<SnapshotMeta | null> {
    if (this.isRunning) {
      this.logger.warn('Перевірка схеми вже виконується — пропускаю.');
      return null;
    }
    this.isRunning = true;
    const startedAt = Date.now();
    try {
      const { fingerprint, counts } = await this.computeFingerprint();
      const meta = this.readMeta();

      if (
        meta &&
        meta.fingerprint === fingerprint &&
        fs.existsSync(this.snapshotFile)
      ) {
        this.writeMeta({ ...meta, lastCheckAt: new Date().toISOString(), lastTrigger: trigger });
        this.logger.log(
          `📚 Схема ${SCHEMA_OWNER} без змін (${trigger}, ${Date.now() - startedAt} мс).`,
        );
        return this.readMeta();
      }

      this.logger.log(
        `📚 Виявлено зміни схеми ${SCHEMA_OWNER} (${trigger}) — збираю метадані...`,
      );
      const previous = this.loadSnapshotSafe();
      const snapshot = await this.harvestSchema(fingerprint, counts);

      const changes = previous
        ? this.diffSnapshots(previous, snapshot)
        : ['Створено початковий снапшот схеми'];
      snapshot.history = [
        { at: snapshot.generatedAt, trigger, changes },
        ...(previous?.history ?? []),
      ].slice(0, HISTORY_LIMIT);

      this.persistSnapshot(snapshot);
      const newMeta: SnapshotMeta = {
        generatedAt: snapshot.generatedAt,
        fingerprint,
        counts,
        lastCheckAt: snapshot.generatedAt,
        lastTrigger: trigger,
      };
      this.writeMeta(newMeta);
      this.cached = snapshot;

      this.logger.log(
        `✅ Документацію схеми ${SCHEMA_OWNER} оновлено: ${snapshot.tables.length} таблиць, ` +
          `${snapshot.plsql.length} PL/SQL-об'єктів, ${changes.length} змін (${Date.now() - startedAt} мс).`,
      );
      return newMeta;
    } catch (err) {
      this.logger.error('Помилка перевірки/оновлення схеми Oracle:', err);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  /** Один швидкий запит: лічильники та MAX(LAST_DDL_TIME) по типах + лічильники коментарів. */
  private async computeFingerprint(): Promise<{
    fingerprint: string;
    counts: Record<string, number>;
  }> {
    const rows = await this.oracle.executeQuery<{
      KIND: string;
      CNT: number;
      MAX_DDL: string | null;
    }>(
      `
      SELECT OBJECT_TYPE AS KIND,
             COUNT(*) AS CNT,
             TO_CHAR(MAX(LAST_DDL_TIME), 'YYYY-MM-DD HH24:MI:SS') AS MAX_DDL
        FROM ALL_OBJECTS
       WHERE OWNER = :own
       GROUP BY OBJECT_TYPE
      UNION ALL
      SELECT 'TAB_COMMENTS', COUNT(*), NULL
        FROM ALL_TAB_COMMENTS
       WHERE OWNER = :own AND COMMENTS IS NOT NULL
      UNION ALL
      SELECT 'COL_COMMENTS', COUNT(*), NULL
        FROM ALL_COL_COMMENTS
       WHERE OWNER = :own AND COMMENTS IS NOT NULL
      ORDER BY 1
      `,
      { own: SCHEMA_OWNER },
    );

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.KIND] = Number(r.CNT);
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify(rows))
      .digest('hex');
    return { fingerprint, counts };
  }

  /** Повний збір метаданих схеми (без вихідного коду PL/SQL — він у файл не пишеться). */
  private async harvestSchema(
    fingerprint: string,
    counts: Record<string, number>,
  ): Promise<OracleSchemaSnapshot> {
    const own = { own: SCHEMA_OWNER };

    const [tables, columns, fks, objects, args, indexes, views] =
      await Promise.all([
        this.oracle.executeQuery<{ TABLE_NAME: string; COMMENTS: string | null }>(
          `SELECT t.TABLE_NAME, c.COMMENTS
             FROM ALL_TABLES t
             LEFT JOIN ALL_TAB_COMMENTS c
               ON c.OWNER = t.OWNER AND c.TABLE_NAME = t.TABLE_NAME
            WHERE t.OWNER = :own
            ORDER BY t.TABLE_NAME`,
          own,
        ),
        this.oracle.executeQuery<{
          TABLE_NAME: string;
          COLUMN_NAME: string;
          DATA_TYPE: string;
          NULLABLE: string;
          COMMENTS: string | null;
        }>(
          `SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.NULLABLE, com.COMMENTS
             FROM ALL_TAB_COLUMNS c
             LEFT JOIN ALL_COL_COMMENTS com
               ON com.OWNER = c.OWNER
              AND com.TABLE_NAME = c.TABLE_NAME
              AND com.COLUMN_NAME = c.COLUMN_NAME
            WHERE c.OWNER = :own
            ORDER BY c.TABLE_NAME, c.COLUMN_ID`,
          own,
        ),
        this.oracle.executeQuery<{
          CHILD_TABLE: string;
          CONSTRAINT_NAME: string;
          CHILD_COLUMNS: string;
          PARENT_TABLE: string;
          PARENT_COLUMNS: string;
        }>(
          `SELECT a.TABLE_NAME AS CHILD_TABLE,
                  a.CONSTRAINT_NAME,
                  LISTAGG(acc.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY acc.POSITION) AS CHILD_COLUMNS,
                  c_pk.TABLE_NAME AS PARENT_TABLE,
                  LISTAGG(rcc.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY rcc.POSITION) AS PARENT_COLUMNS
             FROM ALL_CONSTRAINTS a
             JOIN ALL_CONS_COLUMNS acc
               ON acc.CONSTRAINT_NAME = a.CONSTRAINT_NAME AND acc.OWNER = a.OWNER
             JOIN ALL_CONSTRAINTS c_pk
               ON c_pk.CONSTRAINT_NAME = a.R_CONSTRAINT_NAME AND c_pk.OWNER = a.R_OWNER
             JOIN ALL_CONS_COLUMNS rcc
               ON rcc.CONSTRAINT_NAME = c_pk.CONSTRAINT_NAME AND rcc.OWNER = c_pk.OWNER
            WHERE a.CONSTRAINT_TYPE = 'R' AND a.OWNER = :own
            GROUP BY a.TABLE_NAME, a.CONSTRAINT_NAME, c_pk.TABLE_NAME
            ORDER BY a.TABLE_NAME`,
          own,
        ),
        this.oracle.executeQuery<{
          OBJECT_NAME: string;
          OBJECT_TYPE: string;
          STATUS: string;
          LAST_DDL: string;
        }>(
          `SELECT OBJECT_NAME, OBJECT_TYPE, STATUS,
                  TO_CHAR(LAST_DDL_TIME, 'YYYY-MM-DD HH24:MI:SS') AS LAST_DDL
             FROM ALL_OBJECTS
            WHERE OWNER = :own
              AND OBJECT_TYPE IN ('FUNCTION','PROCEDURE','PACKAGE','TRIGGER')
            ORDER BY OBJECT_TYPE, OBJECT_NAME`,
          own,
        ),
        this.oracle.executeQuery<{
          OBJECT_NAME: string;
          PACKAGE_NAME: string | null;
          ARGUMENT_NAME: string | null;
          POSITION: number;
          DATA_TYPE: string | null;
          IN_OUT: string;
        }>(
          `SELECT OBJECT_NAME, PACKAGE_NAME, ARGUMENT_NAME, POSITION, DATA_TYPE, IN_OUT
             FROM ALL_ARGUMENTS
            WHERE OWNER = :own AND DATA_LEVEL = 0
            ORDER BY PACKAGE_NAME, OBJECT_NAME, POSITION`,
          own,
        ),
        this.oracle.executeQuery<{
          INDEX_NAME: string;
          TABLE_NAME: string;
          UNIQUENESS: string;
        }>(
          `SELECT INDEX_NAME, TABLE_NAME, UNIQUENESS
             FROM ALL_INDEXES
            WHERE OWNER = :own
            ORDER BY TABLE_NAME, INDEX_NAME`,
          own,
        ),
        this.oracle.executeQuery<{ VIEW_NAME: string }>(
          `SELECT VIEW_NAME FROM ALL_VIEWS WHERE OWNER = :own ORDER BY VIEW_NAME`,
          own,
        ),
      ]);

    const columnsByTable = new Map<string, OracleTableDoc['columns']>();
    for (const c of columns) {
      let list = columnsByTable.get(c.TABLE_NAME);
      if (!list) {
        list = [];
        columnsByTable.set(c.TABLE_NAME, list);
      }
      list.push({
        name: c.COLUMN_NAME,
        dataType: c.DATA_TYPE,
        nullable: c.NULLABLE === 'Y',
        comment: c.COMMENTS ?? null,
      });
    }

    const fksByChild = new Map<string, OracleTableDoc['foreignKeys']>();
    const referencedBy = new Map<string, Set<string>>();
    for (const fk of fks) {
      let list = fksByChild.get(fk.CHILD_TABLE);
      if (!list) {
        list = [];
        fksByChild.set(fk.CHILD_TABLE, list);
      }
      list.push({
        constraintName: fk.CONSTRAINT_NAME,
        columns: fk.CHILD_COLUMNS,
        parentTable: fk.PARENT_TABLE,
        parentColumns: fk.PARENT_COLUMNS,
      });
      let refs = referencedBy.get(fk.PARENT_TABLE);
      if (!refs) {
        refs = new Set();
        referencedBy.set(fk.PARENT_TABLE, refs);
      }
      refs.add(fk.CHILD_TABLE);
    }

    const argsByObject = new Map<string, OraclePlsqlDoc['arguments']>();
    for (const a of args) {
      const key = a.PACKAGE_NAME || a.OBJECT_NAME;
      let list = argsByObject.get(key);
      if (!list) {
        list = [];
        argsByObject.set(key, list);
      }
      list.push({
        name: a.ARGUMENT_NAME,
        position: Number(a.POSITION),
        dataType: a.DATA_TYPE,
        inOut: a.IN_OUT,
        packageName: a.PACKAGE_NAME,
      });
    }

    return {
      version: SNAPSHOT_VERSION,
      generatedAt: new Date().toISOString(),
      fingerprint,
      counts,
      tables: tables.map((t) => ({
        name: t.TABLE_NAME,
        comment: t.COMMENTS ?? null,
        columns: columnsByTable.get(t.TABLE_NAME) ?? [],
        foreignKeys: fksByChild.get(t.TABLE_NAME) ?? [],
        referencedBy: [...(referencedBy.get(t.TABLE_NAME) ?? [])].sort(),
      })),
      plsql: objects.map((o) => ({
        name: o.OBJECT_NAME,
        type: o.OBJECT_TYPE,
        status: o.STATUS,
        lastDdlTime: o.LAST_DDL,
        arguments: argsByObject.get(o.OBJECT_NAME) ?? [],
      })),
      views: views.map((v) => ({ name: v.VIEW_NAME })),
      indexes: indexes.map((i) => ({
        name: i.INDEX_NAME,
        table: i.TABLE_NAME,
        unique: i.UNIQUENESS === 'UNIQUE',
      })),
      history: [],
    };
  }

  /** Людиночитний диф двох снапшотів — потрапляє в history і в лог. */
  private diffSnapshots(
    prev: OracleSchemaSnapshot,
    next: OracleSchemaSnapshot,
  ): string[] {
    const changes: string[] = [];

    const prevTables = new Map(prev.tables.map((t) => [t.name, t]));
    const nextTables = new Map(next.tables.map((t) => [t.name, t]));
    for (const name of nextTables.keys()) {
      if (!prevTables.has(name)) changes.push(`Нова таблиця: ${name}`);
    }
    for (const name of prevTables.keys()) {
      if (!nextTables.has(name)) changes.push(`Видалено таблицю: ${name}`);
    }
    for (const [name, t] of nextTables) {
      const old = prevTables.get(name);
      if (!old) continue;
      const oldCols = new Set(old.columns.map((c) => c.name));
      const newCols = new Set(t.columns.map((c) => c.name));
      for (const c of newCols) {
        if (!oldCols.has(c)) changes.push(`${name}: нова колонка ${c}`);
      }
      for (const c of oldCols) {
        if (!newCols.has(c)) changes.push(`${name}: видалено колонку ${c}`);
      }
      if (old.comment !== t.comment) {
        changes.push(`${name}: змінено коментар таблиці`);
      }
    }

    const key = (o: { name: string; type: string }) => `${o.type}:${o.name}`;
    const prevObjs = new Map(prev.plsql.map((o) => [key(o), o]));
    const nextObjs = new Map(next.plsql.map((o) => [key(o), o]));
    for (const [k, o] of nextObjs) {
      const old = prevObjs.get(k);
      if (!old) {
        changes.push(`Новий об'єкт: ${o.type} ${o.name}`);
      } else if (old.lastDdlTime !== o.lastDdlTime) {
        changes.push(`Змінено: ${o.type} ${o.name} (${o.lastDdlTime})`);
      }
    }
    for (const [k, o] of prevObjs) {
      if (!nextObjs.has(k)) changes.push(`Видалено об'єкт: ${o.type} ${o.name}`);
    }

    return changes.length ? changes : ['Зміни у службових метаданих схеми'];
  }

  // ---------- Публічний доступ для контролера ----------

  getStatus(): SnapshotMeta | null {
    return this.readMeta();
  }

  getDocs(): OracleSchemaSnapshot {
    if (this.cached) return this.cached;
    const snapshot = this.loadSnapshotSafe();
    if (!snapshot) {
      throw new ServiceUnavailableException(
        'Снапшот схеми ще не згенеровано. Запустіть оновлення або дочекайтеся планової перевірки.',
      );
    }
    this.cached = snapshot;
    return snapshot;
  }

  async forceRefresh(): Promise<SnapshotMeta | null> {
    if (!this.secret) {
      throw new ServiceUnavailableException(
        'ORACLE_DOCS_SECRET не задано — збереження снапшота неможливе.',
      );
    }
    // Примусове оновлення ігнорує відбиток: скидаємо мету, щоб пройти повний збір.
    const meta = this.readMeta();
    if (meta) this.writeMeta({ ...meta, fingerprint: 'force-refresh' });
    return this.checkAndUpdate('manual');
  }

  // ---------- Шифроване сховище ----------

  private persistSnapshot(snapshot: OracleSchemaSnapshot) {
    const secret = this.secret;
    if (!secret) return;
    fs.mkdirSync(this.storageDir, { recursive: true });

    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const cipherKey = crypto.scryptSync(secret, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey, iv);
    const plain = Buffer.from(JSON.stringify(snapshot), 'utf8');
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Формат файлу: salt(16) + iv(12) + authTag(16) + ciphertext
    const tmp = `${this.snapshotFile}.tmp`;
    fs.writeFileSync(tmp, Buffer.concat([salt, iv, tag, enc]));
    fs.renameSync(tmp, this.snapshotFile);
  }

  private loadSnapshotSafe(): OracleSchemaSnapshot | null {
    const secret = this.secret;
    if (!secret || !fs.existsSync(this.snapshotFile)) return null;
    try {
      const raw = fs.readFileSync(this.snapshotFile);
      const salt = raw.subarray(0, 16);
      const iv = raw.subarray(16, 28);
      const tag = raw.subarray(28, 44);
      const enc = raw.subarray(44);
      const cipherKey = crypto.scryptSync(secret, salt, 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
      return JSON.parse(plain.toString('utf8')) as OracleSchemaSnapshot;
    } catch (err) {
      this.logger.error(
        'Не вдалося розшифрувати снапшот схеми (зміна секрету або пошкоджений файл):',
        err,
      );
      return null;
    }
  }

  private readMeta(): SnapshotMeta | null {
    try {
      if (!fs.existsSync(this.metaFile)) return null;
      return JSON.parse(fs.readFileSync(this.metaFile, 'utf8')) as SnapshotMeta;
    } catch {
      return null;
    }
  }

  private writeMeta(meta: SnapshotMeta) {
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.writeFileSync(this.metaFile, JSON.stringify(meta, null, 2), 'utf8');
  }
}
