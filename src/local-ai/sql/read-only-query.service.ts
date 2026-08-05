import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseOracleService } from 'src/database-oracle/database-oracle.service';
import { SqlDialect, SqlGuardService } from './sql-guard.service';

export interface ReadOnlyQueryContext {
  /** Хто ініціював запит — для аудиту. */
  userId?: number;
  /** Через який tool або сценарій прийшов SQL. */
  source: string;
}

export interface ReadOnlyQueryResult {
  rows: any[];
  rowCount: number;
  durationMs: number;
  /** Чи вперся результат у стелю maxRows — щоб чесно сказати це користувачу. */
  truncated: boolean;
}

/**
 * Виконання SELECT-ів, породжених ШІ.
 *
 * Другий рубіж захисту після SqlGuardService: запит іде в транзакції READ ONLY
 * зі statement_timeout, тож навіть якщо валідатор щось пропустить, СУБД відхилить
 * будь-яку спробу запису сама.
 *
 * Постійний read-only користувач БД (postgres_ai_reader з task.md) —
 * третій рубіж; він задається в .env і цим кодом не створюється.
 *
 * Джерело зараз одне — Postgres. Oracle вимкнено (`LOCAL_AI_ORACLE_ENABLED`),
 * гілка виконання лишена цілою, щоб повернути його однією змінною оточення.
 */
@Injectable()
export class ReadOnlyQueryService {
  private readonly logger = new Logger(ReadOnlyQueryService.name);

  private readonly maxRows: number;
  private readonly timeoutMs: number;
  private readonly oracleEnabled: boolean;

  constructor(
    @Inject('PG_POOL') private readonly pgPool: Pool,
    private readonly oracleService: DatabaseOracleService,
    private readonly sqlGuard: SqlGuardService,
    private readonly configService: ConfigService,
  ) {
    this.maxRows = Number(
      this.configService.get<string>('LOCAL_AI_MAX_ROWS') ?? 200,
    );
    this.timeoutMs = Number(
      this.configService.get<string>('LOCAL_AI_SQL_TIMEOUT_MS') ?? 15000,
    );
    // Дефолт — вимкнено: локальна модель працює лише з Postgres
    this.oracleEnabled =
      this.configService.get<string>('LOCAL_AI_ORACLE_ENABLED') === 'true';
  }

  public getMaxRows(): number {
    return this.maxRows;
  }

  /** Чи дозволений Oracle як джерело даних для локальної моделі. */
  public isOracleEnabled(): boolean {
    return this.oracleEnabled;
  }

  /**
   * Прогнати SQL через валідатор і виконати його лише на читання.
   * Кожен запит — і успішний, і відхилений — потрапляє в лог.
   */
  public async run(
    rawSql: string,
    dialect: SqlDialect,
    context: ReadOnlyQueryContext,
    params: any[] | Record<string, any> = [],
  ): Promise<ReadOnlyQueryResult> {
    if (dialect === 'oracle' && !this.oracleEnabled) {
      this.logger.warn(
        `Запит до Oracle відхилено (source=${context.source}): джерело вимкнено`,
      );
      throw new ForbiddenException(
        'Oracle для локального помічника вимкнено — доступна лише база Postgres',
      );
    }

    const { sql, tables } = this.sqlGuard.validate(
      rawSql,
      dialect,
      this.maxRows,
    );

    const started = Date.now();
    this.logger.log(
      `SQL [${dialect}] source=${context.source} user=${context.userId ?? '-'} tables=[${tables.join(', ')}] :: ${sql}`,
    );

    try {
      const rows =
        dialect === 'postgres'
          ? await this.runPostgres(sql, params as any[])
          : await this.oracleService.executeReadOnlyQuery<any>(
              sql,
              params as Record<string, any>,
            );

      const durationMs = Date.now() - started;
      this.logger.log(
        `SQL OK [${dialect}] source=${context.source} rows=${rows.length} ${durationMs}ms`,
      );

      return {
        rows,
        rowCount: rows.length,
        durationMs,
        truncated: rows.length >= this.maxRows,
      };
    } catch (err: any) {
      this.logger.error(
        `SQL FAILED [${dialect}] source=${context.source} ${Date.now() - started}ms: ${err?.message}`,
      );
      throw err;
    }
  }

  /**
   * Postgres: окремий клієнт із пулу, транзакція READ ONLY і локальний таймаут.
   * ROLLBACK у finally — навіть на помилці з'єднання повертається в пул чистим.
   */
  private async runPostgres(sql: string, params: any[]): Promise<any[]> {
    const client = await this.pgPool.connect();

    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${this.timeoutMs}`);
      const { rows } = await client.query(sql, params);
      return rows;
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        this.logger.error('Rollback read-only транзакції не вдався', rollbackErr);
      }
      client.release();
    }
  }
}
