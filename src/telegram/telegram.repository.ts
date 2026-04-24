import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class TelegramRepository {
  constructor(@Inject('PG_POOL') private readonly pool: Pool) {}

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
}
