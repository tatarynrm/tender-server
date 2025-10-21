import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TokenType } from 'prisma/__generated__';
import { MailService } from 'src/libs/common/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserService } from 'src/user/user.service';
import { v4 as uuidv4 } from 'uuid';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { NewPasswordDto } from './dto/new-password.dto';
import { hash } from 'argon2';
import { Pool } from 'pg';

@Injectable()
export class PasswordRecoveryService {
  public constructor(
    private readonly prismaService: PrismaService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  public async resetPassword(dto: ResetPasswordDto) {
    const existingUser = await this.userService.findByEmail(dto.email);

    if (!existingUser) {
      throw new NotFoundException(
        `Користувач не знайдений. Будь ласка перевірте адресу вашої електронної пошти`,
      );
    }

    const passwordResetToken = await this.generatePasswordResetToken(dto.email);

    await this.mailService.sendPasswordResetEmail(
      passwordResetToken.email,
      passwordResetToken.token,
    );

    return true;
  }

  public async newPassword(dto: NewPasswordDto, token: string) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const isExistinToken = await client.query(
        `SELECT * FROM usr_token WHERE token = $1 AND token_type = $2`,
        [token, 'PASSWORD_RESET'],
      );

      const tokenExist = isExistinToken.rows[0];
      if (!tokenExist) {
        throw new NotFoundException(
          `Токен не знайдено. Будь ласка перевірте правильність введеного токену`,
        );
      }

      const isExpired = new Date(tokenExist.expiresIn) < new Date();
      if (isExpired) {
        throw new BadRequestException(
          `Термін дії токену вичерпався. Запросіть новий токен для підтвердження`,
        );
      }

      const existingUser = await this.userService.findByEmail(tokenExist.email);
      if (!existingUser) {
        throw new NotFoundException(
          `Користувача не знайдено. Перевірте правильність введеної електронної адреси`,
        );
      }

      // 🔒 Оновлення паролю
      const hashedPassword = await hash(dto.password);
      await client.query(`UPDATE usr SET password_hash = $1 WHERE id = $2`, [
        hashedPassword,
        existingUser.id,
      ]);

      // 🗑️ Видалення токена
      await client.query(`DELETE FROM usr_token WHERE id = $1`, [
        tokenExist.id,
      ]);

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

private async generatePasswordResetToken(email: string) {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');

    const token = uuidv4();
    const expiresIn = new Date(Date.now() + 3600 * 1000);

    // видаляємо старий токен
    await client.query(
      `DELETE FROM usr_token WHERE email = $1 AND token_type = $2`,
      [email, 'PASSWORD_RESET'],
    );

    // створюємо новий
    const result = await client.query(
      `INSERT INTO usr_token (email, token, expires_in, token_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, token, expiresIn, 'PASSWORD_RESET'],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

}
