import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { hash, verify } from 'argon2';
import { UpdateUserDto } from './dto/update-user.dto';
import { Pool, QueryResult } from 'pg';

import { RegisterDto } from 'src/auth/dto/register.dto';
import type { Request } from 'express';
import { DatabaseService } from 'src/database/database.service';
import { CompanyFillPreRegister } from './dto/company-fill-pre-register.dto';
import { CreateUserFromCompany } from './dto/create-user-from-company.dto';
import { UserRegisterFromPreDto } from './dto/user-register-from-pre.dto';
import { MailService } from 'src/libs/common/mail/mail.service';
import type { RedisClientType } from 'redis';
import { IUserProfile } from './types/user.type';
import { TelegramTokenService } from 'src/telegram/telegram-token/telegram-token.service';
import { UserGateway } from './user.gateway';
@Injectable()
export class UserService {
  public constructor(
    private readonly dbservice: DatabaseService,

    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly mailService: MailService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
    private readonly telegramTokenService: TelegramTokenService,
    private readonly userGateway: UserGateway,
  ) { }

  public async findById(id: string | number) {
    // 1. Отримуємо основні дані юзера з процедури
    const existUser = await this.dbservice.callProcedure(
      'usr_find',
      { id: id },
      {},
    );

    const user = existUser.content;
    console.log(user, 'USER FROM ME');
    if (!user) {
      throw new NotFoundException(
        'Користувача не знайдено. Перевірте авторизаційні дані.',
      );
    }

    // 2. Запит без аліасів (бо тепер дані будуть в ізольованому об'єкті)
    const telegramResult = await this.pool.query(
      `SELECT telegram_id, username, first_name 
       FROM person_telegram 
       WHERE id_person = $1`,
      [user.person.id],
    );

    const telegramData = telegramResult.rows[0];

    // 3. Телефони працівника з галочками месенджерів (масив об'єктів).
    const phoneResult = await this.pool.query(
      `SELECT id, phone, is_telegram, is_viber, is_whatsapp
         FROM person_phone
        WHERE id_person = $1
        ORDER BY id`,
      [user.person.id],
    );

    // 4. Зливаємо дані: додаємо вкладений об'єкт person_telegram і масив телефонів.
    // Якщо telegramData немає, повертаємо null
    const enrichedUser = {
      ...user,
      person_telegram: telegramData
        ? {
          telegram_id: telegramData.telegram_id,
          username: telegramData.username,
          first_name: telegramData.first_name,
        }
        : null,
      person_phone: phoneResult.rows,
    };

    return enrichedUser;
  }

  // Додати телефон працівника з галочками месенджерів (Telegram/Viber/WhatsApp).
  public async addProfilePhone(
    userId: string | number,
    dto: {
      phone: string;
      is_telegram?: boolean;
      is_viber?: boolean;
      is_whatsapp?: boolean;
    },
  ) {
    const user = await this.findById(userId);
    const idPerson = user.person.id;

    const result = await this.pool.query(
      `INSERT INTO person_phone (id_person, phone, is_telegram, is_viber, is_whatsapp)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, phone, is_telegram, is_viber, is_whatsapp`,
      [
        idPerson,
        dto.phone,
        dto.is_telegram ?? false,
        dto.is_viber ?? false,
        dto.is_whatsapp ?? false,
      ],
    );

    return result.rows[0];
  }
  public async findByEmail(email: string) {
    const result: QueryResult<IUserProfile> = await this.pool.query(
      `select * from usr where email = $1`,
      [email],
    );

    const user = result.rows[0] || null;

    return user;
  }

  public async create(dto: RegisterDto) {
    const hashPassword = await hash(dto.password);
    const result = await this.pool.query(
      `
  INSERT INTO usr 
    (email,password_hash,surname,name,last_name,phone)
  VALUES 
    ($1, $2, $3, $4, $5, $6)
  RETURNING *
  `,
      [
        dto.email,
        hashPassword,
        dto.surname,
        dto.name,
        dto.last_name,
        dto.phone,
      ],
    );
    const newUser = result.rows[0];

    return newUser;
  }

  public async createOrUpdateUserFromCompany(
    dto: CreateUserFromCompany & { id_company: number; id?: number },
  ) {
    // створення нового користувача
    const result = await this.dbservice.callProcedure('usr_register', dto, {});
    return result;
  }

  public async getOneUser(id: number | string) {
    const result = await this.dbservice.callProcedure(
      'usr_one',
      { id: id },
      {},
    );
    return result;
  }
  public async getAllUsersFromCompany() {
    const result = await this.dbservice.callProcedure(
      'usr_list',

      {},

      {},
    );

    return result;
  }

  public async update(userId: string, dto: UpdateUserDto) {
    const user = await this.findById(userId);

    const updateUserTest = await this.pool.query(
      `update usr set name = $1 where  id = $2`,
      [dto.name],
    );

    return updateUserTest;
  }

  public async updateRole(userId: string, dto: { is_head_department?: boolean }) {
    const user = await this.findById(userId);

    if (dto.is_head_department !== undefined) {
      await this.pool.query(
        `UPDATE person_role SET is_head_department = $1 WHERE id_person = $2`,
        [dto.is_head_department, user.person.id],
      );
    }

    return { success: true };
  }

  // ФВЬШЩТ СЩЛЬЬФТВІ
  public async getAllPreRegisterUsers(req: Request) {
    // const user = await this.findById(userId);

    const usersPreRegister = await this.dbservice.callProcedure(
      'usr_pre_register_list',

      {
        pagination: {
          page_num: 1,
          page_rows: 10,
        },
      },

      {},
    );

    return usersPreRegister;
  }

  // Створити користувача який є в передреєстрації!
  public async createPreRegisterUser(dto: UserRegisterFromPreDto) {

    const usersPreRegister = await this.dbservice.callProcedure(
      'usr_register_from_pre',

      dto,

      {},
    );
    this.mailService.sendPreRegisterSuccessGreeting(dto.email, dto.name);

    if (usersPreRegister && usersPreRegister[0]) {
      this.userGateway.emitToAll('pre_register_updated', usersPreRegister[0]);
    }

    return usersPreRegister;
  }
  public async companyFillFromUsrPreRegister(dto: CompanyFillPreRegister) {
    // const user = await this.findById(userId);

    const usersPreRegister = await this.dbservice.callProcedure(
      'company_fill_from_usr_pre_register',

      {
        id_usr_pre_register: dto.id_usr_pre_register,
      },

      {},
    );

    if (usersPreRegister && usersPreRegister[0]) {
      this.userGateway.emitToAll('pre_register_updated', usersPreRegister[0]);
    }

    return usersPreRegister;
  }

  public async adminCreateUser(
    dto: CreateUserFromCompany & { id_company: number; id?: number },
  ) {
    // створення нового користувача
    const result = await this.dbservice.callProcedure('usr_register', dto, {});
    return result;
  }

  async getAllUsers(params: {
    pagination?: { page_num: number; page_rows: number };
    filter?: any[];
    sort?: any;
  }) {
    const { pagination } = params;

    // 1. Отримуємо користувачів з БД
    const result = await this.dbservice.callProcedure(
      'usr_list',
      {
        pagination,
      },
      {},
    );

    const users = Array.isArray(result) ? result : result.content;
    if (!users || users.length === 0) return result;

    // 2. Беремо онлайн користувачів із реального трекера присутності
    // (ZSET online_users_active, який наповнює UserGateway). Раніше тут
    // читався ключ online_users_set, який ніхто не наповнював, тож isOnline
    // завжди був false. Вікно — 2 хвилини, як у get_online_users.
    const threshold = Math.floor(Date.now() / 1000) - 120;
    const onlineIds: string[] = await this.redisClient.zRangeByScore(
      'online_users_active',
      threshold,
      '+inf',
    );
    const onlineSet = new Set(onlineIds);

    // 3. Додаємо isOnline
    const usersWithStatus = users.map((user) => ({
      ...user,
      isOnline: onlineSet.has(user.id.toString()),
    }));

    // 4. Повертаємо у тому ж форматі
    return Array.isArray(result)
      ? usersWithStatus
      : { ...result, content: usersWithStatus };
  }

  // --- додаємо метод блокування ---
  public async blockUser(userId: number) {
    const blockUSer = this.pool.query(
      `update usr set is_blocked = true where id = $1`,
      [userId],
    );

    return blockUSer;
  }

  async linkTelegram(telegramId: number, token: string) {
    const user = await this.pool.query(
      `SELECT * FROM users WHERE telegram_token = $1`,
      [token],
    );

    if (!user.rows[0]) throw new Error('Токен недійсний');

    await this.pool.query(
      `UPDATE users SET telegram_id = $1, telegram_token = NULL WHERE id = $2`,
      [telegramId, user.rows[0].id],
    );
  }

  /**
   * Генерація одноразового токена для прив'язки Telegram
   */
  async generateTelegramToken(userId: number) {
    const user = await this.findById(userId);
    if (!user || !user.email) throw new Error('Користувача не знайдено');

    return this.telegramTokenService.createOrUpdateTelegramConnectToken(
      user.email,
    );
  }

  // public async unblockUser(userId: number) {
  //   return this.prisma.user.update({
  //     where: { id: userId },
  //     data: { is_blocked: false },
  //   });
  // }

  public async getUserListIct() {

    const result = await this.dbservice.callProcedure(
      'usr_list_ict',

      {},

      {},
    );

    return result;
  }

  public async changePassword(userId: string | number, dto: any) {
    const { oldPassword, newPassword } = dto;

    // 1. Отримуємо профілі через існуючий метод (там є ім'я та пошта)
    const userProfile = await this.findById(userId);

    // 2. Отримуємо хеш пароля з таблиці usr
    const authResult = await this.pool.query(
      `SELECT password_hash FROM usr WHERE id = $1`,
      [userId],
    );
    const authData = authResult.rows[0];

    if (!authData) {
      throw new NotFoundException(
        'Користувача не знайдено в системі авторизації',
      );
    }

    // 3. Перевіряємо старий пароль
    const isPasswordValid = await verify(authData.password_hash, oldPassword);
    if (!isPasswordValid) {
      throw new BadRequestException('Невірний старий пароль');
    }

    // 4. Хешуємо новий пароль
    const newHash = await hash(newPassword);

    // 5. Оновлюємо в БД
    await this.pool.query(`UPDATE usr SET password_hash = $1 WHERE id = $2`, [
      newHash,
      userId,
    ]);

    // 6. Відправляємо лист
    try {
      await this.mailService.sendPasswordChangeSuccessEmail(
        userProfile.email,
        userProfile.person.name,
      );
    } catch (e) {
      console.error('Failed to send password change email', e);
    }

    return { message: 'Пароль успішно змінено' };
  }
}
