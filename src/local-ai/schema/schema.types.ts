/**
 * Типи каталогу схеми БД, який бачить модель.
 *
 * Каталог — це єдине джерело правди одразу для двох речей:
 *   1. промпт генератора SQL (модель знає, які таблиці, колонки й звʼязки існують);
 *   2. whitelist SqlGuardService (усе, чого немає в каталозі, читати заборонено).
 *
 * Наповнює каталог жива інтроспекція Postgres: модель бачить УСІ таблиці схеми
 * `public`, крім явно заборонених. Статичний [postgres.catalog.ts](./postgres.catalog.ts)
 * лишається шаром сенсу — описи, правила, приклади — і резервом на випадок,
 * коли база недоступна.
 */

export interface SchemaColumn {
  name: string;
  /** Тип у термінах Postgres (bigint, numeric, timestamptz...). */
  type: string;
  /** Опис українською — береться з COMMENT ON COLUMN, якщо він є в базі. */
  description?: string;
  /** Первинний ключ. Модель за ним розуміє, що з чим зʼєднувати. */
  isPrimaryKey?: boolean;
}

export interface SchemaTable {
  name: string;
  /** Що зберігає таблиця: COMMENT ON TABLE, а якщо його немає — опис із файлу каталогу. */
  description: string;
  columns: SchemaColumn[];
  /** Нюанси, яких немає в метаданих БД: значення статусів, підводні камені. */
  hints?: string[];
  /** Таблиця чи представлення — для представлень немає сенсу шукати ключі. */
  kind?: 'table' | 'view';
  /** Таблиця описана в статичному каталозі вручну — такі йдуть у промпті першими. */
  curated?: boolean;
}

/**
 * Звʼязок між таблицями. `source` розрізняє реальний зовнішній ключ і здогад
 * за назвою колонки (`id_company` → `company.id`): у цій базі FK стоять не всюди,
 * а конвенція іменування витримана, тому здогади суттєво допомагають моделі.
 */
export interface SchemaRelation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  source: 'foreign_key' | 'naming';
}

export interface SchemaCatalog {
  /** Поки що лише Postgres: Oracle для помічника вимкнено. */
  dialect: 'postgres';
  tables: SchemaTable[];
  /** Готові JOIN-и з файлу каталогу — модель бере їх дослівно. */
  joins: string[];
  /** Звʼязки, знайдені в базі: зовнішні ключі та здогади за назвами колонок. */
  relations?: SchemaRelation[];
  /** Правила предметної області: як рахувати відділ тендера, що таке «закритий» тощо. */
  rules: string[];
  /** Приклади «питання → SQL» — найдієвіший спосіб задати діалект і стиль. */
  examples: Array<{ question: string; sql: string }>;
}

/** Звідки взято таблиці й колонки в поточному стані каталогу. */
export type SchemaSource = 'database' | 'static';
