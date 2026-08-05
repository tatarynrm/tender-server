import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchemaCatalogService } from '../schema/schema-catalog.service';

export type SqlDialect = 'postgres' | 'oracle';

export interface SqlGuardResult {
  /** SQL, доведений до безпечного вигляду (з примусовим лімітом рядків). */
  sql: string;
  /** Таблиці, які запит реально читає — йдуть в аудит-лог. */
  tables: string[];
}

/**
 * Валідатор SQL для всього, що приходить від локальної моделі.
 *
 * Відколи модель пише SQL сама (tool `runSqlQuery`), цей клас — головний рубіж
 * захисту, а не формальність. Правило одне й безумовне: **дозволено лише SELECT**.
 * Будь-яка мутація (INSERT/UPDATE/DELETE/MERGE), DDL (DROP/ALTER/CREATE/TRUNCATE),
 * керування транзакціями і виклик коду відхиляються тут, до звернення до БД.
 *
 * Другий рубіж — виконання в READ ONLY-транзакції (ReadOnlyQueryService), де вже
 * сама СУБД відхиляє запис, навіть якщо валідатор чогось не передбачив.
 *
 * Oracle для локальної моделі вимкнено: працюємо лише з Postgres.
 *
 * Свідомо не використовуємо parser-бібліотеку: список заборон нижче перевірений
 * на проді в Telegram-гілці, а зовнішній парсер додав би залежність і власні
 * діри в діалектах.
 */
@Injectable()
export class SqlGuardService {
  private readonly logger = new Logger(SqlGuardService.name);

  /** Мутації, DDL, керування транзакціями і виконання коду. */
  private static readonly FORBIDDEN_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UPSERT', 'REPLACE',
    'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'RENAME', 'COMMENT',
    'GRANT', 'REVOKE', 'AUDIT', 'NOAUDIT',
    'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'LOCK',
    'CALL', 'EXEC', 'EXECUTE', 'BEGIN', 'DECLARE', 'DO',
    'COPY', 'VACUUM', 'CLUSTER', 'REINDEX', 'REFRESH', 'LISTEN', 'NOTIFY',
    'SET', 'RESET', 'FLASHBACK', 'PURGE', 'INTO', 'RETURNING',
  ];

  /**
   * Функції з побічними ефектами або доступом до ФС — формально живуть усередині SELECT.
   *
   * SET_CONFIG тут не для краси: `SELECT set_config('statement_timeout','0',false)`
   * проходить у READ ONLY-транзакції, переживає ROLLBACK і лишається на з'єднанні,
   * яке повертається в загальний PG_POOL. Одна така вибірка зняла б таймаут
   * випадковому запиту іншого модуля.
   */
  private static readonly FORBIDDEN_FUNCTIONS = [
    'NEXTVAL', 'SETVAL', 'CURRVAL',
    'SET_CONFIG', 'CURRENT_SETTING',
    'LO_IMPORT', 'LO_EXPORT', 'DBLINK', 'QUERY_TO_XML',
    'DBMS_', 'UTL_', 'SYS\\.',
  ];

  /**
   * Колонки, які не читає навіть той, кому дозволено писати SQL.
   *
   * У промпті їх немає (HIDDEN_COLUMN_PATTERNS), але промпт — це прохання,
   * а не обмеження: 7B-модель цілком може згадати колонку з попереднього контексту.
   */
  private static readonly DENIED_COLUMNS = [
    'private_info', 'password_hash', 'password',
  ];

  /**
   * Таблиці з логінами й сесіями та системні каталоги.
   * Дублює whitelist навмисно: якщо таку таблицю колись помилково додадуть
   * у каталог схеми, доступ до неї все одно не відкриється.
   */
  private static readonly ALWAYS_DENIED = [
    'usr', 'session', 'sessions', 'pg_shadow', 'pg_authid', 'pg_user',
    'information_schema', 'pg_catalog', 'all_users', 'dba_users', 'user$',
  ];

  /**
   * Whitelist Oracle. Актуальний лише коли LOCAL_AI_ORACLE_ENABLED=true —
   * зараз джерело вимкнене, список лишений, щоб повернення не потребувало коду.
   */
  private static readonly ORACLE_TABLES = [
    'firma', 'perev', 'dog', 'zay', 'pret', 'kontakt', 'os',
    'actvr', 'avrmonclient', 'bankp', 'bankv', 'cabper_stat_main',
    'kraina', 'obl', 'town', 'valut', 'valutcurs',
  ];

  private readonly oracleEnabled: boolean;

  constructor(
    private readonly schemaCatalog: SchemaCatalogService,
    private readonly configService: ConfigService,
  ) {
    this.oracleEnabled =
      this.configService.get<string>('LOCAL_AI_ORACLE_ENABLED') === 'true';
  }

  /**
   * Повна перевірка SQL. Кидає ForbiddenException із причиною, якщо запит небезпечний.
   * Повертає SQL із примусовим лімітом рядків.
   */
  public validate(
    rawSql: string,
    dialect: SqlDialect,
    maxRows: number,
  ): SqlGuardResult {
    const sql = (rawSql ?? '').trim().replace(/;+\s*$/, '');

    if (dialect !== 'postgres' && !this.oracleEnabled) {
      this.deny(sql, dialect, 'дозволено лише Postgres, Oracle вимкнено');
    }

    if (!sql) {
      throw new ForbiddenException('Порожній SQL-запит');
    }

    // Одна інструкція: ніяких "SELECT 1; DROP TABLE ..."
    if (sql.includes(';')) {
      this.deny(sql, dialect, 'кілька інструкцій в одному запиті');
    }

    // Коментарі — класичний спосіб сховати хвіст запиту від валідатора
    if (/--|\/\*|\*\//.test(sql)) {
      this.deny(sql, dialect, 'коментарі в SQL заборонені');
    }

    // Лише SELECT. WITH не дозволяємо: CTE в Postgres може містити INSERT/UPDATE
    if (!/^SELECT\b/i.test(sql)) {
      this.deny(sql, dialect, 'дозволено лише SELECT');
    }

    for (const keyword of SqlGuardService.FORBIDDEN_KEYWORDS) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(sql)) {
        this.deny(sql, dialect, `заборонена команда: ${keyword}`);
      }
    }

    // SELECT ... FOR UPDATE / FOR SHARE блокує рядки — це вже не «лише читання»
    if (/\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i.test(sql)) {
      this.deny(sql, dialect, 'блокування рядків (FOR UPDATE/SHARE)');
    }

    // Усе службове Postgres — pg_sleep, pg_read_file, pg_class тощо.
    // Прикладних сценаріїв для pg_* у нас немає, тому вирізаємо префікс цілком.
    if (dialect === 'postgres' && /\bpg_/i.test(sql)) {
      this.deny(sql, dialect, 'службові об’єкти pg_* недоступні');
    }

    for (const fn of SqlGuardService.FORBIDDEN_FUNCTIONS) {
      if (new RegExp(`\\b${fn}`, 'i').test(sql)) {
        this.deny(sql, dialect, `заборонена функція: ${fn.replace('\\\\.', '.')}`);
      }
    }

    for (const column of SqlGuardService.DENIED_COLUMNS) {
      if (new RegExp(`\\b${column}\\b`, 'i').test(sql)) {
        this.deny(sql, dialect, `колонка "${column}" недоступна`);
      }
    }

    const tables = this.extractTables(sql);
    this.assertTablesAllowed(sql, dialect, tables);

    return { sql: this.enforceRowLimit(sql, dialect, maxRows), tables };
  }

  /** Таблиці з FROM і JOIN — саме їх перевіряємо за whitelist. */
  private extractTables(sql: string): string[] {
    const found = new Set<string>();
    const pattern = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_$]*(?:\s*\.\s*[a-zA-Z_][a-zA-Z0-9_$]*)?)/gi;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sql)) !== null) {
      // Підзапит "FROM (" сюди не потрапляє — регексп вимагає ідентифікатор
      found.add(match[1].replace(/\s+/g, '').toLowerCase());
    }

    return [...found];
  }

  private assertTablesAllowed(
    sql: string,
    dialect: SqlDialect,
    tables: string[],
  ): void {
    if (tables.length === 0) {
      this.deny(sql, dialect, 'не вдалося визначити таблиці запиту');
    }

    // Whitelist Postgres = каталог схеми: що не описано для моделі, того вона й не читає
    const allowed =
      dialect === 'postgres'
        ? this.schemaCatalog.getAllowedTables()
        : SqlGuardService.ORACLE_TABLES;

    for (const table of tables) {
      // Схема-префікс відкидаємо — доступ до схеми задає сам конекшн
      const bare = table.includes('.') ? table.split('.').pop()! : table;

      const schema = table.includes('.') ? table.split('.')[0] : null;
      if (
        SqlGuardService.ALWAYS_DENIED.includes(bare) ||
        (schema !== null && SqlGuardService.ALWAYS_DENIED.includes(schema))
      ) {
        this.deny(sql, dialect, `доступ до таблиці "${table}" заборонено`);
      }

      if (!allowed.includes(bare)) {
        this.deny(
          sql,
          dialect,
          `таблиця "${table}" відсутня у списку дозволених`,
        );
      }
    }
  }

  /**
   * Примусовий ліміт рядків: модель регулярно забуває LIMIT, а вивантажити
   * всю таблицю в контекст — це і секунди очікування, і зайві дані в промпті.
   */
  private enforceRowLimit(
    sql: string,
    dialect: SqlDialect,
    maxRows: number,
  ): string {
    if (dialect === 'postgres') {
      // LIMIT шукаємо будь-де, а не лише в кінці: модель часто пише "LIMIT 500 OFFSET 20"
      const existing = sql.match(/\bLIMIT\s+(\d+)/i);

      if (existing) {
        return Number(existing[1]) <= maxRows
          ? sql
          : sql.replace(/\bLIMIT\s+\d+/i, `LIMIT ${maxRows}`);
      }

      return `${sql} LIMIT ${maxRows}`;
    }

    // Oracle: FETCH FIRST працює з 12c; ROWNUM у WHERE лишаємо як є, якщо він уже стоїть
    if (/\bFETCH\s+(FIRST|NEXT)\b/i.test(sql) || /\bROWNUM\b/i.test(sql)) {
      return sql;
    }
    return `${sql} FETCH FIRST ${maxRows} ROWS ONLY`;
  }

  private deny(sql: string, dialect: SqlDialect, reason: string): never {
    // Логуємо і відхилені запити теж — це слід спроби обійти обмеження
    this.logger.warn(
      `SQL відхилено [${dialect}]: ${reason} | запит: ${sql.slice(0, 300)}`,
    );
    throw new ForbiddenException(`SQL відхилено: ${reason}`);
  }
}
