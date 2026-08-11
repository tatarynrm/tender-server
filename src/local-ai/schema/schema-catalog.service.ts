import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import {
  DENIED_TABLE_PATTERNS,
  HIDDEN_COLUMN_PATTERNS,
  POSTGRES_CATALOG,
} from './postgres.catalog';
import {
  SchemaCatalog,
  SchemaColumn,
  SchemaRelation,
  SchemaSource,
  SchemaTable,
} from './schema.types';

/**
 * Знання моделі про базу: які таблиці існують, що в них лежить і як їх зʼєднувати.
 *
 * Джерело — жива інтроспекція схеми `public`: УСІ таблиці й представлення, їхні
 * колонки, типи, `COMMENT ON TABLE/COLUMN`, первинні ключі та звʼязки. Модель
 * не обмежена заздалегідь описаним списком, але інтроспекція не запускається
 * сама собою — нова таблиця стає видимою лише після ручного
 * `POST /local-ai/schema/refresh`.
 *
 * Поверх інтроспекції лягає [postgres.catalog.ts](./postgres.catalog.ts) —
 * описи, підказки, правила й приклади для найуживаніших таблиць. Доки refresh
 * не викликаний, каталог — це сам файл: без нього генератор SQL не має що
 * показати моделі.
 *
 * Цей же список таблиць — whitelist для SqlGuardService, тому DENIED_TABLE_PATTERNS —
 * не косметика: усе, що не потрапило в каталог, для моделі не існує.
 */
@Injectable()
export class SchemaCatalogService {
  private readonly logger = new Logger(SchemaCatalogService.name);

  private catalog: SchemaCatalog = POSTGRES_CATALOG;
  private source: SchemaSource = 'static';
  private refreshedAt: Date | null = null;

  /** Промпт-текст перебудовується лише після refresh, а не на кожен запит користувача. */
  private promptCache: string | null = null;

  constructor(@Inject('PG_POOL') private readonly pool: Pool) {}

  /** Перечитати всю схему з живої бази. Викликається лише вручну через API. */
  public async refresh(): Promise<void> {
    const tableRows = await this.fetchTables();
    const [columnRows, primaryKeys, relations] = await Promise.all([
      this.fetchColumns(),
      this.fetchPrimaryKeys(),
      this.fetchRelations(new Set(tableRows.map((t) => t.table_name))),
    ]);

    // Опис і підказки для відомих таблиць беремо з файлу каталогу
    const curated = new Map(POSTGRES_CATALOG.tables.map((t) => [t.name, t]));

    const columnsByTable = new Map<string, SchemaColumn[]>();
    for (const row of columnRows) {
      if (this.isHiddenColumn(row.column_name)) continue;

      const columns = columnsByTable.get(row.table_name) ?? [];
      columns.push({
        name: row.column_name,
        type: this.shortType(row.data_type),
        description: row.comment?.trim() || undefined,
        isPrimaryKey:
          primaryKeys.has(`${row.table_name}.${row.column_name}`) || undefined,
      });
      columnsByTable.set(row.table_name, columns);
    }

    const tables: SchemaTable[] = tableRows
      .filter((row) => !this.isDeniedTable(row.table_name))
      .map((row) => {
        const known = curated.get(row.table_name);
        const columns = columnsByTable.get(row.table_name) ?? [];

        // Опис колонки з файлу лишається, якщо в базі немає COMMENT
        const fallback = new Map(
          (known?.columns ?? []).map((c) => [c.name, c.description]),
        );

        return {
          name: row.table_name,
          description:
            row.comment?.trim() ||
            known?.description ||
            'опис відсутній — орієнтуйся на назви колонок',
          columns: columns.length
            ? columns.map((c) => ({
                ...c,
                description: c.description ?? fallback.get(c.name),
              }))
            : (known?.columns ?? []),
          hints: known?.hints,
          kind: row.table_type === 'VIEW' ? 'view' : 'table',
          curated: Boolean(known),
        };
      });

    // Описані вручну таблиці — на початок: вони найуживаніші, а модель схильна
    // спиратися на те, що побачила першим
    tables.sort((a, b) => {
      if (a.curated !== b.curated) return a.curated ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const missing = POSTGRES_CATALOG.tables
      .map((t) => t.name)
      .filter((name) => !tables.some((t) => t.name === name));

    if (missing.length) {
      // Таблиця з опорного каталогу зникла з бази — це або перейменування, або не той стенд
      this.logger.warn(
        `Таблиць із опорного каталогу немає в public: ${missing.join(', ')}`,
      );
    }

    const visible = new Set(tables.map((t) => t.name));

    this.catalog = {
      ...POSTGRES_CATALOG,
      tables,
      // Звʼязок із прихованою таблицею моделі лише заважає
      relations: relations.filter(
        (r) => visible.has(r.fromTable) && visible.has(r.toTable),
      ),
    };
    this.source = 'database';
    this.refreshedAt = new Date();
    this.promptCache = null;

    this.logger.log(
      `Каталог схеми оновлено з БД: таблиць ${tables.length}, колонок ${columnRows.length}, звʼязків ${this.catalog.relations?.length ?? 0}`,
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
   * Формат щільний навмисно: у промпт іде вся схема бази, і кожен зайвий рядок
   * множиться на кількість таблиць. Порядок блоків — від конкретного до
   * загального: таблиці, звʼязки, правила, приклади.
   */
  public buildPromptSchema(): string {
    if (this.promptCache) return this.promptCache;

    const tables = this.catalog.tables
      .map((table) => {
        const columns = table.columns
          .map(
            (c) =>
              `    ${c.name} ${c.type}${c.isPrimaryKey ? ' PK' : ''}${c.description ? ` — ${c.description}` : ''}`,
          )
          .join('\n');

        const hints = table.hints?.length
          ? `\n  ${table.hints.map((h) => `! ${h}`).join('\n  ')}`
          : '';

        const kind = table.kind === 'view' ? ' (представлення)' : '';

        return `${table.name}${kind} — ${table.description}\n${columns}${hints}`;
      })
      .join('\n\n');

    const sections = [
      `ТАБЛИЦІ БАЗИ (PostgreSQL, схема public) — усі, до яких у тебе є доступ на читання. Інших не існує:`,
      '',
      tables,
      '',
    ];

    const relations = this.catalog.relations ?? [];
    if (relations.length) {
      sections.push(
        'ЗВʼЯЗКИ МІЖ ТАБЛИЦЯМИ (FK — зовнішній ключ у базі, ~ — звʼязок за назвою колонки, перевіряй його змістом):',
        relations
          .map(
            (r) =>
              `- ${r.source === 'foreign_key' ? 'FK' : '~'} ${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}`,
          )
          .join('\n'),
        '',
      );
    }

    sections.push(
      'ГОТОВІ JOIN-И (перевірені, бери дослівно):',
      this.catalog.joins.map((j) => `- ${j}`).join('\n'),
      '',
      'ПРАВИЛА ПРЕДМЕТНОЇ ОБЛАСТІ:',
      this.catalog.rules.map((r) => `- ${r}`).join('\n'),
      '',
      'ПРИКЛАДИ:',
      '',
      this.catalog.examples
        .map((e) => `Питання: ${e.question}\nSQL: ${e.sql}`)
        .join('\n\n'),
    );

    this.promptCache = sections.join('\n');

    this.logger.debug(
      `Схема для промпту: ${this.promptCache.length} символів, таблиць ${this.catalog.tables.length}`,
    );

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
        kind: t.kind ?? 'table',
        curated: Boolean(t.curated),
      })),
      relations: this.catalog.relations ?? [],
      joins: this.catalog.joins,
      rules: this.catalog.rules,
      examples: this.catalog.examples,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Інтроспекція
  // ─────────────────────────────────────────────────────────────

  private async fetchTables(): Promise<
    { table_name: string; table_type: string; comment: string | null }[]
  > {
    const { rows } = await this.pool.query<{
      table_name: string;
      table_type: string;
      comment: string | null;
    }>(
      `SELECT t.table_name,
              t.table_type,
              obj_description(
                format('%I.%I', t.table_schema, t.table_name)::regclass::oid
              ) AS comment
         FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY t.table_name`,
    );

    return rows;
  }

  private async fetchColumns(): Promise<
    {
      table_name: string;
      column_name: string;
      data_type: string;
      comment: string | null;
    }[]
  > {
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
        ORDER BY c.table_name, c.ordinal_position`,
    );

    return rows;
  }

  /**
   * Первинні ключі окремим запитом по pg_index.
   *
   * Через information_schema це був би підзапит на кожну колонку схеми —
   * ці представлення й самі по собі неквапливі.
   */
  private async fetchPrimaryKeys(): Promise<Set<string>> {
    const { rows } = await this.pool.query<{
      table_name: string;
      column_name: string;
    }>(
      `SELECT c.relname AS table_name,
              a.attname AS column_name
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a
           ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
        WHERE i.indisprimary
          AND n.nspname = 'public'`,
    );

    return new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  }

  /**
   * Звʼязки: спершу справжні зовнішні ключі, далі — здогади за назвами колонок.
   *
   * У цій базі FK стоять не скрізь, зате конвенція `id_<таблиця>` витримана,
   * тому без другої частини модель вигадувала б JOIN-и навмання. Здогади
   * позначені окремо, щоб модель ставилася до них обережніше.
   */
  private async fetchRelations(
    existingTables: Set<string>,
  ): Promise<SchemaRelation[]> {
    const { rows } = await this.pool.query<{
      from_table: string;
      from_column: string;
      to_table: string;
      to_column: string;
    }>(
      `SELECT src.relname   AS from_table,
              src_col.attname AS from_column,
              tgt.relname   AS to_table,
              tgt_col.attname AS to_column
         FROM pg_constraint con
         JOIN pg_class src ON src.oid = con.conrelid
         JOIN pg_class tgt ON tgt.oid = con.confrelid
         JOIN pg_namespace n ON n.oid = src.relnamespace
         JOIN LATERAL unnest(con.conkey, con.confkey)
              AS cols(src_attnum, tgt_attnum) ON true
         JOIN pg_attribute src_col
           ON src_col.attrelid = con.conrelid AND src_col.attnum = cols.src_attnum
         JOIN pg_attribute tgt_col
           ON tgt_col.attrelid = con.confrelid AND tgt_col.attnum = cols.tgt_attnum
        WHERE con.contype = 'f'
          AND n.nspname = 'public'
        ORDER BY src.relname, src_col.attname`,
    );

    const relations: SchemaRelation[] = rows.map((r) => ({
      fromTable: r.from_table,
      fromColumn: r.from_column,
      toTable: r.to_table,
      toColumn: r.to_column,
      source: 'foreign_key',
    }));

    return [
      ...relations,
      ...(await this.inferRelationsByNaming(relations, existingTables)),
    ];
  }

  /** `id_company` → `company.id`, якщо така таблиця існує і FK на неї ще немає. */
  private async inferRelationsByNaming(
    known: SchemaRelation[],
    existingTables: Set<string>,
  ): Promise<SchemaRelation[]> {
    const { rows } = await this.pool.query<{
      table_name: string;
      column_name: string;
    }>(
      `SELECT c.table_name, c.column_name
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.column_name LIKE 'id\\_%'`,
    );

    const already = new Set(
      known.map((r) => `${r.fromTable}.${r.fromColumn}`),
    );

    const inferred: SchemaRelation[] = [];

    for (const row of rows) {
      const target = row.column_name.slice(3);

      if (
        !existingTables.has(target) ||
        already.has(`${row.table_name}.${row.column_name}`)
      ) {
        continue;
      }

      inferred.push({
        fromTable: row.table_name,
        fromColumn: row.column_name,
        toTable: target,
        toColumn: 'id',
        source: 'naming',
      });
    }

    return inferred;
  }

  private isHiddenColumn(column: string): boolean {
    return HIDDEN_COLUMN_PATTERNS.some((pattern) => pattern.test(column));
  }

  private isDeniedTable(table: string): boolean {
    return DENIED_TABLE_PATTERNS.some((pattern) => pattern.test(table));
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
