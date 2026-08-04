import { Inject, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class TelegramRepository implements OnModuleInit {
  private readonly logger = new Logger(TelegramRepository.name);
  private pgTables: { name: string; comments?: string }[] = [];

  constructor(@Inject('PG_POOL') private readonly pool: Pool) {}

  async onModuleInit() {
    await this.loadTableList();
  }

  private async loadTableList() {
    try {
      const { rows } = await this.pool.query(`
        SELECT 
            t.table_name,
            obj_description(c.oid, 'pg_class') AS comments
        FROM 
            information_schema.tables t
        JOIN 
            pg_class c ON c.relname = t.table_name
        WHERE 
            t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name;
      `);
      this.pgTables = rows.map((r: any) => ({
        name: r.table_name,
        comments: r.comments || undefined,
      }));
      this.logger.log(`Loaded ${this.pgTables.length} tables from PostgreSQL schema`);
    } catch (err) {
      this.logger.error('Failed to load PostgreSQL tables list:', err);
    }
  }

  public getTablesList() {
    return this.pgTables;
  }

  public async getTableColumns(tableNames: string[]): Promise<string> {
    if (tableNames.length === 0) return '';

    // Filter table names against pgTables to prevent SQL injection
    const validNames = tableNames
      .map((t) => t.toLowerCase().trim())
      .filter((t) => this.pgTables.some((pt) => pt.name === t));

    if (validNames.length === 0) return '';

    try {
      const { rows } = await this.pool.query(`
        SELECT 
            cols.table_name,
            cols.column_name,
            cols.data_type,
            cols.is_nullable,
            pg_catalog.col_description(c.oid, cols.ordinal_position) AS comments
        FROM 
            information_schema.columns cols
        JOIN 
            pg_class c ON c.relname = cols.table_name
        WHERE 
            cols.table_schema = 'public' 
            AND cols.table_name = ANY($1)
        ORDER BY 
            cols.table_name, cols.ordinal_position;
      `, [validNames]);

      const tablesMap: Record<string, string[]> = {};
      for (const r of rows) {
        if (!tablesMap[r.table_name]) {
          tablesMap[r.table_name] = [];
        }
        const colDesc = `${r.column_name} (${r.data_type}${r.is_nullable === 'YES' ? '?' : ''})${r.comments ? ` - ${r.comments}` : ''}`;
        tablesMap[r.table_name].push(colDesc);
      }

      return Object.entries(tablesMap)
        .map(([tbl, cols]) => `Table: ${tbl}\n  Columns:\n    ${cols.join('\n    ')}`)
        .join('\n\n');
    } catch (err) {
      this.logger.error('Failed to get PostgreSQL table columns:', err);
      return '';
    }
  }


  async findByTelegramId(telegramId: number) {
    const result = await this.pool.query(
      `SELECT * FROM person_telegram WHERE telegram_id = $1`,
      [telegramId],
    );
    return result.rows[0];
  }

  async findByPersonId(personId: number) {
    const result = await this.pool.query(
      `SELECT telegram_id FROM person_telegram WHERE id_person = $1`,
      [personId],
    );
    return result.rows[0];
  }

  async findByToken(token: string) {
    const result = await this.pool.query(
      `SELECT u.id as user_id, p.id as person_id, u.email, ut.token 
       FROM usr_token ut
       JOIN usr u ON ut.email = u.email
       LEFT JOIN person p ON u.email = p.email
       WHERE ut.token = $1 AND ut.token_type = 'TELEGRAM_CONNECT'`,
      [token],
    );
    return result.rows[0];
  }

  async upsertTelegramUser(data: {
    personId: number;
    telegramId: number;
    username: string;
    firstName: string;
  }) {
    await this.pool.query(
      `INSERT INTO person_telegram (id_person, telegram_id, username, first_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_person)
       DO UPDATE SET 
         telegram_id = EXCLUDED.telegram_id,
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name`,
      [data.personId, data.telegramId, data.username, data.firstName],
    );
  }

  async getSubscribersForBroadcast(filter?: { companyIds?: number[]; onlyICT?: boolean }) {
    let query = `
      SELECT pt.telegram_id, p.id as person_id 
      FROM person_telegram pt
      JOIN person p ON pt.id_person = p.id
      JOIN usr u ON p.email = u.email
    `;
    
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.companyIds?.length) {
      params.push(filter.companyIds);
      conditions.push(`u.id_company = ANY($${params.length})`);
    }

    if (filter?.onlyICT) {
      conditions.push(`u.id_company = 1`);
    }

    if (conditions.length) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    const { rows } = await this.pool.query(query, params);
    return rows;
  }

  async getSubscribersByUserIds(userIds: number[]) {
    if (!userIds || userIds.length === 0) return [];
    
    const { rows } = await this.pool.query(`
      SELECT pt.telegram_id 
      FROM person_telegram pt
      JOIN person p ON pt.id_person = p.id
      JOIN usr u ON p.email = u.email
      WHERE u.id = ANY($1)
    `, [userIds]);
    return rows;
  }

  async getSubscriberStats() {
    const { rows } = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN u.id_company = 1 THEN 1 END) as ict_count,
        COUNT(CASE WHEN u.id_company != 1 THEN 1 END) as carrier_count
      FROM person_telegram pt
      JOIN person p ON pt.id_person = p.id
      JOIN usr u ON p.email = u.email
    `);
    return rows[0];
  }

  async getAllTelegramUsers() {
    const { rows } = await this.pool.query(`
      SELECT 
        pt.telegram_id, 
        pt.username, 
        pt.first_name as tg_first_name,
        p.id as person_id,
        p.name,
        p.surname,
        p.last_name,
        p.email,
        c.company_name,
        u.id as user_id,
        u.is_blocked
      FROM person_telegram pt
      LEFT JOIN person p ON pt.id_person = p.id
      LEFT JOIN company c ON p.id_company = c.id
      LEFT JOIN usr u ON p.email = u.email
      ORDER BY p.surname ASC, p.name ASC
    `);
    return rows;
  }

  async getUserRoles(telegramId: number): Promise<{ is_admin: boolean; is_ict: boolean; name?: string; surname?: string; last_name?: string } | null> {
    const { rows } = await this.pool.query(`
      SELECT pr.is_admin, pr.is_ict, p.name, p.surname, p.last_name
      FROM person_telegram pt
      JOIN person p ON pt.id_person = p.id
      JOIN person_role pr ON p.id = pr.id_person
      WHERE pt.telegram_id = $1
    `, [telegramId]);
    return rows[0] || null;
  }


  /**
   * Виконання SQL, згенерованого ШІ, у транзакції READ ONLY з таймаутом.
   * Postgres сам відхилить будь-який запис (INSERT/UPDATE/DELETE, nextval,
   * setval тощо) незалежно від тексту запиту; після виконання — rollback.
   */
  async runReadOnlyQuery(sql: string, params: any[] = []): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      await client.query(`SET LOCAL statement_timeout = '15s'`);
      const { rows } = await client.query(sql, params);
      return rows;
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        this.logger.error('Rollback of read-only query failed', rollbackErr);
      }
      client.release();
    }
  }

  // --- Дані для рольового меню бота ---

  /** Профіль користувача бота: особа + компанія + ролі одним запитом. */
  async getProfileByTelegramId(telegramId: number) {
    const { rows } = await this.pool.query(
      `
      SELECT
        p.id AS person_id,
        p.name, p.surname, p.last_name, p.email, p.position,
        p.id_company AS company_id,
        c.company_name, c.edrpou,
        u.is_blocked,
        pr.is_admin, pr.is_ict,
        pt.username, pt.first_name
      FROM person_telegram pt
      JOIN person p ON p.id = pt.id_person
      LEFT JOIN company c ON c.id = p.id_company
      LEFT JOIN usr u ON u.email = p.email
      LEFT JOIN person_role pr ON pr.id_person = p.id
      WHERE pt.telegram_id = $1
      LIMIT 1
      `,
      [telegramId],
    );
    return rows[0] || null;
  }

  /** Активні напрямки тендерів, найближчі до завершення — для меню ІСТ. */
  async getActiveTenders(limit: number) {
    const { rows } = await this.pool.query(
      `
      SELECT
        t.id, t.cargo, t.price_start, t.ids_valut, t.request_price,
        t.time_end, t.car_count,
        tl.city_from, tl.city_to, tl.ids_country_from, tl.ids_country_to
      FROM tender_lst tl
      JOIN tender t ON t.id = tl.id_tender
      WHERE tl.ids_status = 'ACTIVE'
      ORDER BY t.time_end ASC NULLS LAST
      LIMIT $1
      `,
      [limit],
    );
    return rows;
  }

  async getActiveTendersCount(): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM tender_lst WHERE ids_status = 'ACTIVE'`,
    );
    return rows[0]?.cnt ?? 0;
  }

  /** Останні ставки компанії-перевізника з позначкою перемоги. */
  async getCompanyRates(companyId: number, limit: number) {
    const { rows } = await this.pool.query(
      `
      SELECT
        tr.id, tr.price_proposed, tr.car_count, tr.time_add,
        t.id AS tender_id, t.cargo, t.ids_valut,
        tl.city_from, tl.city_to,
        (tw.id IS NOT NULL) AS is_winner
      FROM tender_rate tr
      JOIN tender t ON t.id = tr.id_tender
      LEFT JOIN LATERAL (
        SELECT city_from, city_to
        FROM tender_lst
        WHERE id_tender = t.id
        ORDER BY id
        LIMIT 1
      ) tl ON true
      LEFT JOIN tender_winner tw ON tw.id_tender_rate = tr.id
      WHERE tr.id_company = $1
      ORDER BY tr.time_add DESC
      LIMIT $2
      `,
      [companyId, limit],
    );
    return rows;
  }

  /** Виграні тендери компанії-перевізника. */
  async getCompanyWins(companyId: number, limit: number) {
    const { rows } = await this.pool.query(
      `
      SELECT
        tw.id, tw.car_count,
        t.id AS tender_id, t.cargo, t.ids_valut,
        tr.price_proposed, tr.time_add,
        tl.city_from, tl.city_to
      FROM tender_winner tw
      JOIN tender t ON t.id = tw.id_tender
      LEFT JOIN tender_rate tr ON tr.id = tw.id_tender_rate
      LEFT JOIN LATERAL (
        SELECT city_from, city_to
        FROM tender_lst
        WHERE id_tender = t.id
        ORDER BY id
        LIMIT 1
      ) tl ON true
      WHERE tw.id_company = $1
      ORDER BY tw.id DESC
      LIMIT $2
      `,
      [companyId, limit],
    );
    return rows;
  }

  /** Лічильники активності для зведення менеджерів ІСТ. */
  async getIctSummary() {
    const { rows } = await this.pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM tender_lst WHERE ids_status = 'ACTIVE') AS active_lines,
        (SELECT COUNT(*)::int FROM tender_lst WHERE ids_status = 'ANALYZE') AS analyze_lines,
        (SELECT COUNT(*)::int FROM tender WHERE created_at >= now() - interval '1 day') AS tenders_24h,
        (SELECT COUNT(*)::int FROM tender WHERE created_at >= now() - interval '7 days') AS tenders_7d,
        (SELECT COUNT(*)::int FROM tender_rate WHERE time_add >= now() - interval '1 day') AS rates_24h,
        (SELECT COUNT(*)::int FROM tender_rate WHERE time_add >= now() - interval '7 days') AS rates_7d
    `);
    return rows[0];
  }
}

