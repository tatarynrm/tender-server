/**
 * Типи каталогу схеми БД, який бачить локальна модель.
 *
 * Каталог — це єдине джерело правди одразу для двох речей:
 *   1. промпт генератора SQL (модель знає, які таблиці й колонки існують);
 *   2. whitelist SqlGuardService (усе, чого немає в каталозі, читати заборонено).
 *
 * Тому додавання таблиці в каталог — це і є видача моделі доступу до неї.
 */

export interface SchemaColumn {
  name: string;
  /** Тип у термінах Postgres (bigint, numeric, timestamp with time zone...). */
  type: string;
  /** Опис українською — береться з COMMENT ON COLUMN, якщо він є в базі. */
  description?: string;
}

export interface SchemaTable {
  name: string;
  /** Що зберігає таблиця — своїми словами, бо COMMENT ON TABLE у базі не заповнені. */
  description: string;
  /**
   * Колонки. У статичному каталозі це резервний список на випадок, коли база
   * недоступна; у робочому режимі його замінює інтроспекція information_schema.
   */
  columns: SchemaColumn[];
  /** Нюанси, яких немає в метаданих БД: значення статусів, підводні камені. */
  hints?: string[];
}

export interface SchemaCatalog {
  /** Поки що лише Postgres: Oracle для локальної моделі вимкнено. */
  dialect: 'postgres';
  tables: SchemaTable[];
  /** Готові JOIN-и — модель бере їх дослівно замість вигадування зв'язків. */
  joins: string[];
  /** Правила предметної області: як рахувати відділ тендера, що таке «закритий» тощо. */
  rules: string[];
  /** Приклади «питання → SQL». Найдієвіший спосіб навчити 7B-модель діалекту. */
  examples: Array<{ question: string; sql: string }>;
}

/** Звідки взято колонки в поточному стані каталогу. */
export type SchemaSource = 'database' | 'static';
