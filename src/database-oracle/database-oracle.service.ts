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
  private pool!: oracledb.Pool;

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
  /**
   * Виконання SELECT-запиту в транзакції READ ONLY — для SQL, згенерованого ШІ.
   * Oracle сам відхилить будь-яку спробу запису (включно з SELECT ... FOR UPDATE),
   * незалежно від того, що саме згенерувала модель. Після запиту — rollback.
   */
  async executeReadOnlyQuery<T>(
    sql: string,
    params: Record<string, any> = {},
  ): Promise<T[]> {
    let connection: oracledb.Connection | undefined;

    try {
      connection = await this.pool.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ICTDAT`);
      await connection.execute(`SET TRANSACTION READ ONLY`);
      const result = await connection.execute<T>(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      return result.rows || [];
    } catch (err) {
      this.logger.error(`Error executing read-only query: ${sql}`, err);
      throw err;
    } finally {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          this.logger.error('Error rolling back read-only transaction', rollbackErr);
        }
        try {
          await connection.close();
        } catch (closeErr) {
          this.logger.error('Error closing connection', closeErr);
        }
      }
    }
  }

  /**
   * Виконані рейси з конкретним замовником (ZAY.KOD_ZAM = migrate_id компанії
   * в Postgres), від нових до старих. Прямий SELECT — окремої процедури під
   * це немає, за аналогією з kod_per у p_carrier.run для перевізників.
   *
   * MEN_ZAV/MEN_ROZV — наші ICT-менеджери (по завантаженні/розвантаженні,
   * ZAY.KOD_MENZ/KOD_MENP → OS). У таблиці OS немає полів телефону/email
   * (лише SKYPE) — контакти менеджерів тут показати нічим.
   * KONTAKT_ZAM/KONTAKT_PER — зовнішні контакти на боці замовника/перевізника
   * (ZAY.KOD_KONTAKTZ/KOD_KONTAKTP → KONTAKT), здебільшого NULL — заповнені
   * не у всіх рейсах. Телефон/email цих контактів — окрема таблиця
   * KONTAKTVAL (типізована через KONTAKTTYPE: 'Мобільний'/'Телефон'/'E-Mail'),
   * kv_agg згортає її по KOD_KONTAKT в один рядок, щоб не розмножувати JOIN.
   * VALUTZ_NAME/VALUTP_NAME — розшифровка коду валюти (ZAY.KOD_VALUTZ/
   * KOD_VALUTP → VALUT.NDOV), інакше замість "грн" показувався б сирий код.
   * CARRIER_NAME/PERSUMA — перевізник і сума, яку йому сплачено
   * (ZAY.KOD_FIRMAP → FIRMA, ZAY.PERSUMA).
   */
  async getCustomerTrips(kodZam: string, page: number, perPage: number) {
    const offset = (page - 1) * perPage;

    const [rows, countRows] = await Promise.all([
      this.executeReadOnlyQuery<any>(
        `WITH kv_agg AS (
           SELECT kv.KOD_KONTAKT,
                  MIN(CASE WHEN kt.NTYPE = 'Мобільний' THEN kv.VAL END) AS MOB,
                  MIN(CASE WHEN kt.NTYPE = 'Телефон' THEN kv.VAL END) AS TEL,
                  MIN(CASE WHEN kt.NTYPE = 'E-Mail' THEN kv.VAL END) AS EMAIL
           FROM KONTAKTVAL kv
           JOIN KONTAKTTYPE kt ON kt.KOD = kv.KOD_TYPE
           GROUP BY kv.KOD_KONTAKT
         )
         SELECT z.NUM, z.DATZAV, z.DATROZV, z.PUNKTZ, z.PUNKTR,
                z.VOD1, z.VOD1TEL, z.AM, z.AMMARK,
                z.VANTAZH, z.VANTTON,
                z.ZAMSUMA, vz.NDOV AS VALUTZ_NAME,
                z.PERSUMA, vp.NDOV AS VALUTP_NAME,
                fp.NFIRMA AS CARRIER_NAME,
                z.CODE_STATUSMEN, z.PRIMSTATUSMEN,
                TRIM(menz.imja || ' ' || menz.prizv) AS MEN_ZAV,
                TRIM(menp.imja || ' ' || menp.prizv) AS MEN_ROZV,
                kz.nkontakt AS KONTAKT_ZAM,
                COALESCE(kvz.MOB, kvz.TEL) AS KONTAKT_ZAM_TEL,
                kvz.EMAIL AS KONTAKT_ZAM_EMAIL,
                kp.nkontakt AS KONTAKT_PER,
                COALESCE(kvp.MOB, kvp.TEL) AS KONTAKT_PER_TEL,
                kvp.EMAIL AS KONTAKT_PER_EMAIL
         FROM ZAY z
         LEFT JOIN OS menz ON menz.kod = z.KOD_MENZ
         LEFT JOIN OS menp ON menp.kod = z.KOD_MENP
         LEFT JOIN KONTAKT kz ON kz.kod = z.KOD_KONTAKTZ
         LEFT JOIN KONTAKT kp ON kp.kod = z.KOD_KONTAKTP
         LEFT JOIN kv_agg kvz ON kvz.KOD_KONTAKT = z.KOD_KONTAKTZ
         LEFT JOIN kv_agg kvp ON kvp.KOD_KONTAKT = z.KOD_KONTAKTP
         LEFT JOIN VALUT vz ON vz.KOD = z.KOD_VALUTZ
         LEFT JOIN VALUT vp ON vp.KOD = z.KOD_VALUTP
         LEFT JOIN FIRMA fp ON fp.KOD = z.KOD_FIRMAP
         WHERE z.KOD_ZAM = :kodZam
           AND z.DATROZV IS NOT NULL
         ORDER BY z.DATROZV DESC
         OFFSET :offset ROWS FETCH NEXT :perPage ROWS ONLY`,
        { kodZam, offset, perPage },
      ),
      this.executeReadOnlyQuery<{ CNT: number }>(
        `SELECT COUNT(*) AS CNT FROM ZAY WHERE KOD_ZAM = :kodZam AND DATROZV IS NOT NULL`,
        { kodZam },
      ),
    ]);

    const total = Number(countRows[0]?.CNT ?? 0);

    return {
      rows,
      total,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close(0);
    }
  }
}

