import { Inject, Injectable } from '@nestjs/common';

import { Pool } from 'pg';
import { DatabaseService } from 'src/database/database.service';
import { Request } from 'express';
import { randomUUID } from 'crypto';
@Injectable()
export class TelegramTokenService {
  public constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly dbservice: DatabaseService,
  ) {}

  public async createOrUpdateTelegramConnectToken(email: string) {
    const token = randomUUID();
    const tokenType = 'TELEGRAM_CONNECT';

    const query = `
INSERT INTO usr_token (email, token, token_type, expires_in, created_at, updated_at)
VALUES ($1, $2, $3, NOW() + INTERVAL '1 year', NOW(), NOW())
ON CONFLICT (email, token_type)
DO UPDATE 
  SET token = EXCLUDED.token,
      expires_in = EXCLUDED.expires_in,
      updated_at = NOW()
RETURNING *;
`;

    const result = await this.pool.query(query, [email, token, tokenType]);

    return result.rows[0].token;
  }
  // Новий метод для відключення Telegram
  public async disconnectTelegram(telegram_id: number) {
    const query = `DELETE FROM person_telegram WHERE telegram_id = $1`;
    await this.pool.query(query, [telegram_id]);

    return {
      success: true,
      telegram_id: null, // щоб фронтенд міг оновити profile.telegram_id
    };
  }
}
