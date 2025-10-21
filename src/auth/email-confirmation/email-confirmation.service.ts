import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TokenType, User } from 'prisma/__generated__';
import { PrismaService } from 'src/prisma/prisma.service';

import { v4 as uuidv4 } from 'uuid';
import { ConfirmationDto } from './dto/confirmation.dto';
import { MailService } from 'src/libs/common/mail/mail.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from '../auth.service';
import { Request } from 'express';
import { Pool } from 'pg';

@Injectable()
export class EmailConfirmationService {
  public constructor(
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

 public async newVerification(req: Request, dto: { token: string }) {
    // 1. Шукаємо токен
    const tokenResult = await this.pool.query(
      `SELECT * FROM usr_token WHERE token = $1 AND token_type = $2`,
      [dto.token, 'VERIFICATION'],
    );

    const existingToken = tokenResult.rows[0];
    if (!existingToken) {
      throw new NotFoundException(
        `Токен підтвердження не знайдено. Переконайтеся, що у вас правильний токен`,
      );
    }

    // 2. Перевіряємо термін дії
    const isExpired = new Date(existingToken.expires_in) < new Date();
    if (isExpired) {
      throw new BadRequestException('Термін дії цього токену вичерпано');
    }

    // 3. Шукаємо юзера
    const userResult = await this.pool.query(
      `SELECT * FROM usr WHERE email = $1`,
      [existingToken.email],
    );
    const existingUser = userResult.rows[0];

    if (!existingUser) {
      throw new NotFoundException(`Користувача з таким e-mail не існує`);
    }

    // 4. Оновлюємо статус користувача
    await this.pool.query(
      `UPDATE usr SET is_verified = true WHERE id = $1`,
      [existingUser.id],
    );

    // 5. Видаляємо використаний токен
    await this.pool.query(
      `DELETE FROM usr_token WHERE id = $1 AND token_type = $2`,
      [existingToken.id, 'VERIFICATION'],
    );

    // 6. Створюємо/зберігаємо сесію
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
    const token = uuidv4();
    const expiresIn = new Date(Date.now() + 3600 * 1000); // +1 година

    // 1. Шукаємо існуючий токен
    const result = await this.pool.query(
      `SELECT id FROM usr_token WHERE email = $1 AND token_type = $2`,
      [email, 'VERIFICATION']
    );

    const existingToken = result.rows[0];

    // 2. Видаляємо існуючий, якщо є
    if (existingToken) {
      await this.pool.query(
        `DELETE FROM usr_token WHERE id = $1 AND token_type = $2`,
        [existingToken.id, 'VERIFICATION']
      );
    }

    // 3. Створюємо новий токен
    const insertResult = await this.pool.query(
      `INSERT INTO usr_token (email, token, expires_in, token_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, token, expiresIn, 'VERIFICATION']
    );
console.log(insertResult.rows[0],'DASDSADS');

    return insertResult.rows[0];
  }
}
