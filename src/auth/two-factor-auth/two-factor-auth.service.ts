import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';

import { MailService } from 'src/libs/common/mail/mail.service';

@Injectable()
export class TwoFactorAuthService {
  constructor(
    private readonly mailService: MailService,
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  /**
   * ✅ Надсилає токен на пошту
   */
  public async sendTwoFactorToken(email: string) {
    const tokenRecord = await this.generateTwoFactorToken(email);

    await this.mailService.sendTwoFactorTokenEmail(
      tokenRecord.email,
      tokenRecord.token,
    );

    return true;
  }

  /**
   * ✅ Перевіряє код від користувача
   */
  public async validateTwoFactorToken(email: string, code: string) {
    const { rows } = await this.pool.query(
      `SELECT * FROM usr_token 
       WHERE email = $1 AND token_type = 'TWO_FACTOR'
       ORDER BY created_at DESC
       LIMIT 1;`,
      [email],
    );

    const existingToken = rows[0];

    if (!existingToken) {
      throw new NotFoundException(
        'Токен двухфакторної автентифікації не знайдений. Запросіть новий код.',
      );
    }

    if (existingToken.token !== code) {
      throw new BadRequestException('Невірний код. Перевірте введені дані.');
    }

    const isExpired = new Date(existingToken.expires_in) < new Date();
    if (isExpired) {
      throw new BadRequestException('Термін дії токена вичерпано.');
    }

    await this.pool.query(
      `DELETE FROM usr_token WHERE id = $1 AND token_type = 'TWO_FACTOR';`,
      [existingToken.id],
    );

    return true;
  }

  /**
   * 🛠 Генерує та зберігає новий код
   */
  private async generateTwoFactorToken(email: string) {
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresIn = new Date(Date.now() + 5 * 60 * 1000); // 5 хв

    // Видаляємо старий токен
    await this.pool.query(
      `DELETE FROM usr_token WHERE email = $1 AND token_type = 'TWO_FACTOR';`,
      [email],
    );

    // Створюємо новий
    const insertQuery = `
      INSERT INTO usr_token (email, token, token_type, expires_in, created_at, updated_at)
      VALUES ($1, $2, 'TWO_FACTOR', $3, NOW(), NOW())
      RETURNING *;
    `;

    const { rows } = await this.pool.query(insertQuery, [
      email,
      token,
      expiresIn,
    ]);
    return rows[0];
  }
}
