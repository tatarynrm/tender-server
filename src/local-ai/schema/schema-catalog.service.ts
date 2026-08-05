import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { HIDDEN_COLUMN_PATTERNS, POSTGRES_CATALOG } from './postgres.catalog';
import {
  SchemaCatalog,
  SchemaColumn,
  SchemaSource,
  SchemaTable,
} from './schema.types';

/**
 * Знання моделі про базу: які таблиці існують, що в них лежить і як їх з'єднувати.
 *
 * Два джерела, які зводяться в одне:
 *   - postgres.catalog.ts — список дозволених таблиць, призначення, правила, приклади;
 *   - information_schema живої бази — фактичні колонки, типи й COMMENT ON COLUMN.
 *
 * Інтроспекція має пріоритет над файлом: якщо колонку перейменували, модель
 * дізнається про це без правки коду. Якщо база недоступна на старті — працюємо
 * зі статичним каталогом, бо без нього генератор SQL не має що показати моделі.
 *
 * Цей же список таблиць — whitelist для SqlGuardService, тому додавання таблиці
 * сюди дорівнює видачі моделі доступу до неї.
 */
@Injectable()
export class SchemaCatalogService implements OnModuleInit {
  private readonly logger = new Logger(SchemaCatalogService.name);

  private catalog: SchemaCatalog = POSTGRES_CATALOG;
  private source: SchemaSource = 'static';
  private refreshedAt: Date | null = null;

  /** Промпт-текст перебудовується лише після refresh, а не на кожен запит користувача. */
  private promptCache: string | null = null;

  constructor(@Inject('PG_POOL') private readonly pool: Pool) {}

  public async onModuleInit(): Promise<void> {
    // Старт бекенда не має падати через недоступну базу — тоді просто лишається статичний каталог
    await this.refresh().catch((err) =>
      this.logger.warn(
        `Каталог схеми лишається статичним: ${err?.message ?? err}`,
      ),
    );
  }

  /** Перечитати колонки з живої бази. Викликається на старті й вручну через API. */
  public async refresh(): Promise<void> {
    const tableNames = POSTGRES_CATALOG.tables.map((t) => t.name);

    const { rows } = await this.pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      comment: string | null;
    }>(
      `SELECT c.table_name,
              c.column_name,
              c.data_type,
              col_description(
                format('%I.%I', c.table_schema, c.table_name)::regclass::oid,
                c.ordinal_position
              ) AS comment
         FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = ANY($1)
        ORDER BY c.table_name, c.ordinal_position`,
      [tableNames],
    );

    const byTable = new Map<string, SchemaColumn[]>();
    for (const row of rows) {
      if (this.isHidden(row.column_name)) continue;

      const columns = byTable.get(row.table_name) ?? [];
      columns.push({
        name: row.column_name,
        type: this.shortType(row.data_type),
        description: row.comment?.trim() || undefined,
      });
      byTable.set(row.table_name, columns);
    }

    const tables: SchemaTable[] = POSTGRES_CATALOG.tables.map((table) => {
      const live = byTable.get(table.name);

      if (!live?.length) {
        // Таблиця з каталогу зникла з бази — це або перейменування, або не той стенд.
        // Мовчати не можна: модель писатиме SQL по неіснуючій таблиці.
        this.logger.warn(
          `Таблиці "${table.name}" немає в public — використано опис із файлу каталогу`,
        );
        return table;
      }

      // Опис колонки з файлу лишається, якщо в базі немає COMMENT
      const fallback = new Map(table.columns.map((c) => [c.name, c.description]));

      return {
        ...table,
        columns: live.map((c) => ({
          ...c,
          description: c.description ?? fallback.get(c.name),
        })),
      };
    });

    this.catalog = { ...POSTGRES_CATALOG, tables };
    this.source = 'database';
    this.refreshedAt = new Date();
    this.promptCache = null;

    this.logger.log(
      `Каталог схеми оновлено з БД: таблиць ${tables.length}, колонок ${rows.length}`,
    );
  }

  /** Таблиці, дозволені для читання. SqlGuardService будує з цього whitelist. */
  public getAllowedTables(): string[] {
    return this.catalog.tables.map((t) => t.name);
  }

  /** Колонки таблиці — для перевірки того, що модель не вигадала поле. */
  public getColumns(table: string): string[] {
    return (
      this.catalog.tables
        .find((t) => t.name === table.toLowerCase())
        ?.columns.map((c) => c.name) ?? []
    );
  }

  /**
   * Опис схеми для промпту генератора SQL.
   *
   * Формат навмисно щільний — 7B-модель губиться в довгих простинях,
   * а кожен зайвий рядок з'їдає контекст, потрібний під саме питання.
   */
  public buildPromptSchema(): string {
    if (this.promptCache) return this.promptCache;

    const tables = this.catalog.tables
      .map((table) => {
        const columns = table.columns
          .map(
            (c) =>
              `    ${c.name} ${c.type}${c.description ? ` — ${c.description}` : ''}`,
          )
          .join('\n');

        const hints = table.hints?.length
          ? `\n  ${table.hints.map((h) => `! ${h}`).join('\n  ')}`
          : '';

        return `${table.name} — ${table.description}\n${columns}${hints}`;
      })
      .join('\n\n');

    const examples = this.catalog.examples
      .map((e) => `Питання: ${e.question}\nSQL: ${e.sql}`)
      .join('\n\n');

    this.promptCache = [
      'ТАБЛИЦІ (PostgreSQL, схема public). Інших таблиць не існує:',
      '',
      tables,
      '',
      'ЗВ’ЯЗКИ:',
      this.catalog.joins.map((j) => `- ${j}`).join('\n'),
      '',
      'ПРАВИЛА ПРЕДМЕТНОЇ ОБЛАСТІ:',
      this.catalog.rules.map((r) => `- ${r}`).join('\n'),
      '',
      'ПРИКЛАДИ:',
      '',
      examples,
    ].join('\n');

    return this.promptCache;
  }

  /** Стан каталогу для ендпоінта /local-ai/schema і health. */
  public describe() {
    return {
      dialect: this.catalog.dialect,
      source: this.source,
      refreshedAt: this.refreshedAt?.toISOString() ?? null,
      tables: this.catalog.tables.map((t) => ({
        name: t.name,
        description: t.description,
        columns: t.columns,
        hints: t.hints ?? [],
      })),
      joins: this.catalog.joins,
      rules: this.catalog.rules,
      examples: this.catalog.examples,
    };
  }

  private isHidden(column: string): boolean {
    return HIDDEN_COLUMN_PATTERNS.some((pattern) => pattern.test(column));
  }

  /** "timestamp with time zone" у промпті — це три зайвих слова на кожну дату. */
  private shortType(dataType: string): string {
    const map: Record<string, string> = {
      'timestamp with time zone': 'timestamptz',
      'timestamp without time zone': 'timestamp',
      'character varying': 'varchar',
      'double precision': 'float8',
    };
    return map[dataType] ?? dataType;
  }
}
