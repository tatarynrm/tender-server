import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Inject,
  forwardRef,

} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { v4 as uuidv4 } from 'uuid';
import { ConfirmationDto } from './dto/confirmation.dto';
import { MailService } from 'src/libs/common/mail/mail.service';
import type { Request } from 'express';
import { Pool } from 'pg';
import { AuthService } from '../auth.service';

@Injectable()
export class EmailConfirmationService implements OnModuleInit {
  private authService: AuthService;

  constructor(
    private readonly mailService: MailService,
    private readonly moduleRef: ModuleRef,
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  onModuleInit() {
    // Використовуємо ModuleRef, без forwardRef
    this.authService = this.moduleRef.get(AuthService, { strict: false });
  }

  public async newVerification(req: Request, dto: ConfirmationDto) {
    const tokenResult = await this.pool.query(
      `SELECT * FROM usr_token WHERE token = $1 AND token_type = $2`,
      [dto.token, 'VERIFICATION'],
    );

    const existingToken = tokenResult.rows[0];
    if (!existingToken) {
      throw new NotFoundException(
        'Токен підтвердження не знайдено. Переконайтеся, що у вас правильний токен',
      );
    }

    const isExpired = new Date(existingToken.expires_in) < new Date();
    if (isExpired) {
      throw new BadRequestException('Термін дії цього токену вичерпано');
    }

    const userResult = await this.pool.query(
      `SELECT * FROM usr WHERE email = $1`,
      [existingToken.email],
    );
    const existingUser = userResult.rows[0];

    if (!existingUser) {
      throw new NotFoundException('Користувача з таким e-mail не існує');
    }

    // Виконуємо все у транзакції
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`UPDATE usr SET verified = true WHERE id = $1`, [
        existingUser.id,
      ]);

      await client.query(
        `DELETE FROM usr_token WHERE id = $1 AND token_type = $2`,
        [existingToken.id, 'VERIFICATION'],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Тепер можна викликати authService без проблем
    return this.authService.saveSession(req, existingUser);
  }

  public async sendVerificationToken(email: string) {
    const verificationToken = await this.generateVerificationToken(email);
    await this.mailService.sendConfirmationEmail(
      verificationToken.email,
      verificationToken.token,
    );
    return true;
  }

  private async generateVerificationToken(email: string) {
    const client = await this.pool.connect();
    try {
      const token = uuidv4();
      const expiresIn = new Date(Date.now() + 3600 * 1000);

      const insertResult = await client.query(
        `
        INSERT INTO usr_token (email, token, expires_in, token_type)
        VALUES ($1, $2, $3, 'VERIFICATION')
        ON CONFLICT (email, token_type)
        DO UPDATE SET token = EXCLUDED.token, expires_in = EXCLUDED.expires_in
        RETURNING *;
      `,
        [email, token, expiresIn],
      );

      console.log(insertResult.rows[0], 'TOKEN CREATED');
      return insertResult.rows[0];
    } finally {
      client.release();
    }
  }
}
