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


  async runReadOnlyQuery(sql: string, params: any[] = []): Promise<any[]> {
    const { rows } = await this.pool.query(sql, params);
    return rows;
  }
}

