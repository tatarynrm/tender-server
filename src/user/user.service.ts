import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { hash } from 'argon2';
import { UpdateUserDto } from './dto/update-user.dto';
import { Pool, QueryResult } from 'pg';
import { IUser } from './types/user.type';
import { RegisterDto } from 'src/auth/dto/register.dto';
import type { Request } from 'express';
import { DatabaseService } from 'src/database/database.service';
import { CompanyFillPreRegister } from './dto/company-fill-pre-register.dto';
import { CreateUserFromCompany } from './dto/create-user-from-company.dto';
import { UserRegisterFromPreDto } from './dto/user-register-from-pre.dto';
@Injectable()
export class UserService {
  public constructor(
    private readonly dbservice: DatabaseService,
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  public async findById(id: string | number) {
    const existUser = await this.pool.query(
      `select a.*,b.company_name
       from usr  a
       left join company b on a.id_company = b.id

      where a.id = $1`,
      [id],
    );

    const user = existUser.rows[0];

    if (!user) {
      throw new NotFoundException(
        'Користувача не знайдено.Перевірте авторизаційні дані.',
      );
    }

    return user;
  }
  public async findByEmail(email: string) {
    const result: QueryResult<IUser> = await this.pool.query(
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
    console.log(dto, 'DTO in service');

    // створення нового користувача
    const result = await this.dbservice.callProcedure('usr_register', dto, {});
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
    console.log(dto, 'USER REGISTER FROM PRE');

    const usersPreRegister = await this.dbservice.callProcedure(
      'usr_register_from_pre',

      dto,

      {},
    );

    return usersPreRegister;
  }
  public async companyFillFromUsrPreRegister(dto: CompanyFillPreRegister) {
    // const user = await this.findById(userId);
    console.log(dto, 'companyFillFromUsrPreRegister -------------');

    const usersPreRegister = await this.dbservice.callProcedure(
      'company_fill_from_usr_pre_register',

      {
        id_usr_pre_register: dto.id_usr_pre_register,
      },

      {},
    );

    return usersPreRegister;
  }

  public async adminCreateUser(
    dto: CreateUserFromCompany & { id_company: number; id?: number },
  ) {
    console.log(dto, 'DTO in service');

    // створення нового користувача
    const result = await this.dbservice.callProcedure('usr_register', dto, {});
    return result;
  }

  async getAllUsers(params: {
    pagination: { page_num: number; page_rows: number };
    filter?: any[];
    sort?: any;
  }) {
    const { pagination, filter = [], sort = null } = params;

    const result = await this.dbservice.callProcedure('usr_list', {
      pagination,
      // pagination: { page_num: number; page_rows: number };
  
    });

    return result;
  }

}
