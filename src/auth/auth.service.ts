import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { UserService } from 'src/user/user.service';

import { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { verify, hash } from 'argon2';
import { ConfigService } from '@nestjs/config';
import { ProviderService } from './provider/provider.service';

import { EmailConfirmationService } from './email-confirmation/email-confirmation.service';
import { TwoFactorAuthService } from './two-factor-auth/two-factor-auth.service';
import * as useragent from 'useragent';
import axios from 'axios';
import { IUser } from 'src/user/types/user.type';
import { Pool } from 'pg';
import { PreRegisterDto } from './dto/pre-register.dto';
import { DatabaseService } from 'src/database/database.service';
import { RegisterIctUserDto } from './dto/register-ict-user.dto';

@Injectable()
export class AuthService {
  public constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly providerService: ProviderService,
    private readonly emailConfirmationService: EmailConfirmationService,
    private readonly twoFactorAuthService: TwoFactorAuthService,
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly dbservice: DatabaseService,
  ) {}
  public async register(dto: RegisterDto) {
    const isExist = await this.userService.findByEmail(dto.email);

    if (isExist) {
      throw new ConflictException('Користувач з таким e-mail вже існує');
    }

    const newUser = await this.userService.create(dto);

    await this.emailConfirmationService.sendVerificationToken(newUser.email);

    return {
      message: `Ви успішно зареєстрували аккаунт.Будь ласка підтвердіть ваш email.Лист був надісланий на вашу електронну адресу`,
    };
  }
  // Передреєстрація -----!!!!!!!!!!!!!!!!!!
  public async preRegister(dto: PreRegisterDto) {
    const password_hash = await hash(dto.password);
    const preRegisterData = { ...dto, password_hash };
    const { password, passwordRepeat, ...safeData } = preRegisterData;
    const result = await this.dbservice.callProcedure(
      'usr_pre_register',

      safeData,

      {},
    );

    return result;
  }

  public async login(req: Request, dto: LoginDto) {
    console.log(dto, 'DTO LOLGIN');

    // const user = await this.userService.findByEmail(dto.email);
    const checkUserExist = await this.dbservice.callProcedure(
      'usr_login',

      dto,

      {},
    );

    const user = checkUserExist.data;

    if (!user) {
      throw new NotFoundException('Користувач не знайдений.');
    }
    const isValidPassword = await verify(user.password_hash, dto.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Невірний пароль');
    }
    console.log(user, 'user in login service');

    if (!user.verified) {
      await this.emailConfirmationService.sendVerificationToken(user.email);
      throw new UnauthorizedException(
        `Ваш емейл не підтверджений.Перевірте вашу пошту та підвердіть адресу електронної пошти`,
      );
    }

    if (user.two_factor_enabled) {
      if (!dto.code) {
        await this.twoFactorAuthService.sendTwoFactorToken(user.email);

        return {
          message: `Перевірте вашу пошту.Потрібен код двухфакторної автентифікації`,
        };
      }

      await this.twoFactorAuthService.validateTwoFactorToken(
        user.email,
        dto.code,
      );
    }
    return this.saveSession(req, user);
  }
  public async logout(req: Request, res: Response): Promise<void> {
    return new Promise((resolve, reject) => {
      req.session.destroy((err: any) => {
        if (err) {
          return reject(
            new InternalServerErrorException('Не вдалось завершити сесію.'),
          );
        }
        res.clearCookie(this.configService.getOrThrow<string>('SESSION_NAME'));
        resolve();
      });
    });
  }

  public async saveSession(req: Request, user: IUser) {
    return new Promise((resolve, reject) => {
      req.session.userId = user.id;
      req.session.ict = user.is_ict;
      req.session.id_company = user.id_company;      // Парсимо User-Agent
      const agent = useragent.parse(req.headers['user-agent'] || '');

      // Отримуємо IP користувача

      // Зберігаємо дані сесії
      req.session.meta = {
        userAgent: req.headers['user-agent'],
        browser: agent.family,
        os: agent.os.family,
        device: agent.device.family,
        createdAt: new Date().toISOString(),
      };

      req.session.save((err: any) => {
        if (err) {
          console.error('Redis session save error:', err);
          return reject(
            new InternalServerErrorException('Не вдалось зберегти сесію'),
          );
        }
        console.log('Session saved to Redis with metadata');
        resolve({ user });
      });
    });
  }

  public async registerFormData() {
    const result = this.dbservice.callProcedure(
      'usr_pre_register_form_data',

      {},

      {},
    );
    return result;
  }

  // ICT FUNCTIONS
  // REGISTER ICT USER
  public async registerIctUser(dto: RegisterIctUserDto) {
    const password_hash = await hash(dto.password);

    const preRegisterData = { ...dto, password_hash };

    const { password, ...safeData } = preRegisterData;

    const result = await this.dbservice.callProcedure(
      'usr_ict_register',

      safeData,

      {},
    );

    return result;
  }
}
