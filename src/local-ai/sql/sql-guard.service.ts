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
 * Валідатор SQL для всього, що приходить від моделі.
 *
 * Модель пише SQL сама (tool `runSqlQuery`) і бачить усю схему бази, тому цей
 * клас — головний рубіж захисту, а не формальність. Правило одне й безумовне:
 * **дозволено лише SELECT**.
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

  /**
   * Мутації, DDL, керування транзакціями і виконання коду.
   *
   * Перевіряємо не голі слова, а команду разом із її продовженням. Причина
   * практична: відколи модель бачить усю схему бази, у запит легально
   * потрапляють колонки `comment`, `notify`, `copy` і функція `replace()` —
   * пословний блек-лист відхиляв би нормальні вибірки й виглядав би як
   * «помічник не працює». Мутація ж без свого продовження нешкідлива:
   * запит усе одно мусить починатися з SELECT і не містити крапки з комою.
   */
  private static readonly FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
    [/\bINSERT\s+INTO\b/i, 'INSERT'],
    [/\bDELETE\s+FROM\b/i, 'DELETE'],
    [/\bUPDATE\s+[a-z_"][\w".]*\s+SET\b/i, 'UPDATE'],
    [/\bMERGE\s+INTO\b/i, 'MERGE'],
    [/\bDROP\s+[a-z]/i, 'DROP'],
    [/\bALTER\s+[a-z]/i, 'ALTER'],
    [/\bCREATE\s+(?:[a-z]|OR\s+REPLACE)/i, 'CREATE'],
    [/\bTRUNCATE\b/i, 'TRUNCATE'],
    [/\bGRANT\b|\bREVOKE\b/i, 'GRANT/REVOKE'],
    [/\bVACUUM\b|\bREINDEX\b|\bCLUSTER\s+[a-z]/i, 'обслуговування БД'],
    [/\bREFRESH\s+MATERIALIZED\b/i, 'REFRESH MATERIALIZED VIEW'],
    [/\bCOPY\s+[a-z_"(]/i, 'COPY'],
    [/\bCALL\s+[a-z_"]/i, 'CALL'],
    [/\bEXEC(?:UTE)?\s+[a-z_"]/i, 'EXECUTE'],
    [/\$\$/, 'долар-цитування ($$)'],
    [
      /\bDECLARE\b|\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b|\bSAVEPOINT\b/i,
      'керування транзакцією',
    ],
    [
      /\bSET\s+(?:LOCAL|SESSION|ROLE|TRANSACTION|CONSTRAINTS|SEARCH_PATH)\b/i,
      'SET',
    ],
    [/\bRESET\s+[a-z]/i, 'RESET'],
    [/\bINTO\s+[a-z_"@:]/i, 'SELECT ... INTO'],
    [/\bRETURNING\b/i, 'RETURNING'],
    [/\bLOCK\s+TABLE\b/i, 'LOCK TABLE'],
    [/\bFLASHBACK\b|\bPURGE\s+[a-z]/i, 'команда Oracle'],
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
    'private_info', 'password_hash', 'password', 'ipn',
  ];

  /**
   * Таблиці з логінами й сесіями та системні каталоги.
   *
   * Дублює DENIED_TABLE_PATTERNS каталогу навмисно: інтроспекція тепер бере
   * усі таблиці схеми, тому помилка в одному фільтрі не повинна одразу
   * відкривати доступ до логінів.
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

    // Лише SELECT. WITH не дозволяємо: CTE в Postgres може містити INSERT/UPDATE
    if (!/^SELECT\b/i.test(sql)) {
      this.deny(sql, dialect, 'дозволено лише SELECT');
    }

    // Далі аналізуємо запит без рядкових літералів: пошук ILIKE '%видалити%'
    // не повинен виглядати для валідатора як спроба мутації
    const probe = this.stripLiterals(sql);

    if (probe.includes("'") || probe.includes('"')) {
      this.deny(sql, dialect, 'незакритий рядковий літерал');
    }

    // Одна інструкція: ніяких "SELECT 1; DROP TABLE ..."
    if (probe.includes(';')) {
      this.deny(sql, dialect, 'кілька інструкцій в одному запиті');
    }

    // Коментарі — класичний спосіб сховати хвіст запиту від валідатора
    if (/--|\/\*|\*\//.test(probe)) {
      this.deny(sql, dialect, 'коментарі в SQL заборонені');
    }

    for (const [pattern, label] of SqlGuardService.FORBIDDEN_PATTERNS) {
      if (pattern.test(probe)) {
        this.deny(sql, dialect, `заборонена команда: ${label}`);
      }
    }

    // SELECT ... FOR UPDATE / FOR SHARE блокує рядки — це вже не «лише читання»
    if (/\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i.test(probe)) {
      this.deny(sql, dialect, 'блокування рядків (FOR UPDATE/SHARE)');
    }

    // Усе службове Postgres — pg_sleep, pg_read_file, pg_class тощо.
    // Прикладних сценаріїв для pg_* у нас немає, тому вирізаємо префікс цілком.
    if (dialect === 'postgres' && /\bpg_/i.test(probe)) {
      this.deny(sql, dialect, 'службові об’єкти pg_* недоступні');
    }

    for (const fn of SqlGuardService.FORBIDDEN_FUNCTIONS) {
      if (new RegExp(`\\b${fn}`, 'i').test(probe)) {
        this.deny(sql, dialect, `заборонена функція: ${fn.replace('\\\\.', '.')}`);
      }
    }

    for (const column of SqlGuardService.DENIED_COLUMNS) {
      if (new RegExp(`\\b${column}\\b`, 'i').test(probe)) {
        this.deny(sql, dialect, `колонка "${column}" недоступна`);
      }
    }

    const tables = this.extractTables(probe);
    this.assertTablesAllowed(sql, dialect, tables);

    return { sql: this.enforceRowLimit(sql, dialect, maxRows), tables };
  }

  /**
   * Замінити плейсхолдером усе, що є текстом, а не синтаксисом: спершу
   * ідентифікатори в подвійних лапках, потім рядкові літерали в одинарних.
   *
   * Порядок важливий. Псевдоніми колонок тепер українські (`AS "Кількість"`),
   * а в українських словах трапляється апостроф — `AS "Обʼєм"` чи `AS "Ім'я"`.
   * Якби спершу зняли одинарні лапки, така назва відкрила б «літерал», якого
   * не існує, і валідатор відхилив би нормальний запит.
   *
   * Лапки подвоюються всередині самих себе (`'O''Brien'`, `"він ""той"""`),
   * тому regexp враховує пару. Ні одинарних, ні подвійних лапок у результаті
   * не лишається: будь-яка вціліла означає незакритий літерал.
   */
  private stripLiterals(sql: string): string {
    return sql
      .replace(/"(?:[^"]|"")*"/g, '?')
      .replace(/'(?:[^']|'')*'/g, '?');
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

    // Whitelist Postgres = каталог схеми (усі таблиці public, крім заборонених):
    // що модель не бачить у промпті, того вона й не прочитає
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
