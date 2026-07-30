import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as oracledb from 'oracledb';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DatabaseOracleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseOracleService.name);
  private pool: oracledb.Pool;

  private oracleTables: { name: string; comments?: string }[] = [];

  async onModuleInit() {
    try {
      this.pool = await oracledb.createPool({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASSWORD,
        connectString: process.env.ORACLE_CONN_STRING,
        poolMin: 1,
        poolMax: 10,
        poolIncrement: 1,
      });

      this.logger.log('Oracle Connection Pool created');
      await this.loadTableList();
    } catch (err) {
      this.logger.error('Oracle Pool Error: ', err);
    }
  }

  private async loadTableList() {
    try {
      const rows = await this.executeQuery<{ TABLE_NAME: string; COMMENTS: string | null }>(
        `SELECT table_name, comments FROM all_tab_comments WHERE owner = 'ICTDAT'`
      );

      // Load enriched table descriptions from JSON file if it exists
      let enrichedComments: Record<string, string> = {};
      try {
        const filePath = path.join(process.cwd(), 'oracle_enriched_comments.json');
        if (fs.existsSync(filePath)) {
          enrichedComments = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          this.logger.log('Loaded enriched Oracle table descriptions from oracle_enriched_comments.json');
        }
      } catch (err) {
        this.logger.error('Failed to load oracle_enriched_comments.json:', err);
      }

      this.oracleTables = rows.map((r) => {
        let comment = enrichedComments[r.TABLE_NAME] || r.COMMENTS || undefined;
        // Enrich generic or poor comments for core business tables to help the AI classifier
        if (r.TABLE_NAME === 'OS') {
          comment = 'Особовий склад, працівники, співробітники компанії, штат, персонал (NOS - ПІБ)';
        } else if (r.TABLE_NAME === 'DOG') {
          comment = 'Договори, контракти з клієнтами та перевізниками (NUMDOC - номер, DATDOC - дата)';
        } else if (r.TABLE_NAME === 'ZAY') {
          comment = 'Заявки на перевезення, замовлення, транспортні рейси, фрахти (VANTAZH, MARSH, AM, PR)';
        } else if (r.TABLE_NAME === 'PEREV') {
          comment = 'Перевізники, транспортні компанії, автопідприємства';
        }
        return {
          name: r.TABLE_NAME,
          comments: comment,
        };
      });
      this.logger.log(`Loaded ${this.oracleTables.length} tables from Oracle schema ICTDAT`);
    } catch (err) {
      this.logger.error('Failed to load Oracle tables list:', err);
    }
  }

  public getTablesList() {
    return this.oracleTables;
  }

  public async getTableColumns(tableNames: string[]): Promise<string> {
    if (tableNames.length === 0) return '';

    // Filter table names against the cached list to prevent SQL injection
    const validNames = tableNames
      .map((t) => t.toUpperCase().trim())
      .filter((t) => this.oracleTables.some((ot) => ot.name === t));

    if (validNames.length === 0) return '';

    const placeholders = validNames.map((_, i) => `:tbl${i}`).join(', ');
    const params = validNames.reduce((acc, name, i) => {
      acc[`tbl${i}`] = name;
      return acc;
    }, {} as Record<string, string>);

    const sql = `
      SELECT c.table_name, c.column_name, c.data_type, c.nullable, com.comments
      FROM all_tab_columns c
      LEFT JOIN all_col_comments com 
        ON c.owner = com.owner 
        AND c.table_name = com.table_name 
        AND c.column_name = com.column_name
      WHERE c.owner = 'ICTDAT' AND c.table_name IN (${placeholders})
      ORDER BY c.table_name, c.column_id
    `;

    try {
      const rows = await this.executeQuery<{
        TABLE_NAME: string;
        COLUMN_NAME: string;
        DATA_TYPE: string;
        NULLABLE: string;
        COMMENTS: string | null;
      }>(sql, params);

      // Group columns by table name
      const tablesMap: Record<string, string[]> = {};
      for (const r of rows) {
        if (!tablesMap[r.TABLE_NAME]) {
          tablesMap[r.TABLE_NAME] = [];
        }
        const colDesc = `${r.COLUMN_NAME} (${r.DATA_TYPE}${r.NULLABLE === 'Y' ? '?' : ''})${r.COMMENTS ? ` - ${r.COMMENTS}` : ''}`;
        tablesMap[r.TABLE_NAME].push(colDesc);
      }

      return Object.entries(tablesMap)
        .map(([tbl, cols]) => `Table: ${tbl}\n  Columns:\n    ${cols.join('\n    ')}`)
        .join('\n\n');
    } catch (err) {
      this.logger.error('Failed to get Oracle table columns:', err);
      return '';
    }
  }

  async executeProcedure<T>(
    funcName: string,
    params: Record<string, any> = {},
  ): Promise<T | null> {
    let connection: oracledb.Connection | undefined;

    try {
      connection = await this.pool.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ICTDAT`);

      // Формуємо bind-змінні. Додаємо змінну :ret для результату функції
      const bindVars = {
        ...params,
        ret: {
          dir: oracledb.BIND_OUT,
          type: oracledb.STRING,
          maxSize: 1000000, // Або oracledb.CLOB, якщо JSON дуже великий
        },
      };

      // Формуємо рядок параметрів (без :ret, бо воно зліва від :=)
      const keys = Object.keys(params);
      const placeholders = keys.map((key) => `:${key}`).join(', ');

      // Генеруємо SQL: BEGIN :ret := func_name(:param1, :param2); END;
      const sql = `BEGIN :ret := ${funcName}(${placeholders}); END;`;

      const result = await connection.execute(sql, bindVars);

      const rawData = (result.outBinds as any)?.ret;
      return rawData ? (JSON.parse(rawData) as T) : null;
    } catch (err) {
      this.logger.error(`Error executing function ${funcName}`, err);
      throw err;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          this.logger.error('Error closing connection', closeErr);
        }
      }
    }
  }

  async executeQuery<T>(
    sql: string,
    params: Record<string, any> = {},
  ): Promise<T[]> {
    let connection: oracledb.Connection | undefined;

    try {
      connection = await this.pool.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ICTDAT`);
      const result = await connection.execute<T>(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      console.log(result, 'result');

      return result.rows || [];
    } catch (err) {
      this.logger.error(`Error executing query: ${sql}`, err);
      throw err;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          this.logger.error('Error closing connection', closeErr);
        }
      }
    }
  }
  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close(0);
    }
  }
}

