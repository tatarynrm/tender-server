import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';
import { MailService } from 'src/libs/common/mail/mail.service';
import type { RedisClientType } from 'redis';

@Injectable()
export class AdminUserService {
  public constructor(
    private readonly dbservice: DatabaseService,
    private readonly mailService: MailService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  public async getAllPreRegisterUsers(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);

    const result = await this.dbservice.callProcedure(
      'usr_pre_register_list',

      {
        pagination: {
          per_page: Number(query.per_page || query.limit || 50),
          limit: Number(query.per_page || query.limit || 50),
          page_rows: Number(query.per_page || query.limit || 50),
          page: Number(query.page || 1),
          page_num: Number(query.page || 1),
        },
        filter: filters,
      },

      {},
    );

    return result;
  }
  public async getAdminUserList(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);

    const result = await this.dbservice.callProcedure(
      'usr_list_ict',

      {
        pagination: {
          per_page: query.limit ?? 10,
          page: query.page ?? 1,
        },
        filter: filters,
      },

      {},
    );

    return result;
  }

  public async getOnlineAdminUsers(query: any) {
    // 1. Get online IDs from Redis (active in last 120 seconds)
    const threshold = Math.floor(Date.now() / 1000) - 120;
    const onlineUserIds = await this.redisClient.zRangeByScore(
      'online_users_active',
      threshold,
      '+inf',
    );

    // 2. Pagination logic
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 50);
    const skip = (page - 1) * limit;

    // We reverse the array to show the most recently active first (or just slice as is)
    // Отримуємо всіх користувачів один раз (через оптимізовану процедуру)
    // Це гарантує правильний формат даних (з person та company)
    const allUsersResult = await this.getAdminUserList({ limit: 10000 });
    const allUsers = allUsersResult?.content || [];

    // Фільтруємо лише тих, хто онлайн
    const onlineUsersList = allUsers.filter((u: any) =>
      onlineUserIds.includes(String(u.id))
    );

    // Застосовуємо пагінацію до відфільтрованого списку
    const paginatedList = onlineUsersList.slice(skip, skip + limit);

    return {
      status: 'ok',
      content: paginatedList,
      props: {
        pagination: {
          rows_all: onlineUsersList.length,
          page,
          per_page: limit,
          page_count: Math.ceil(onlineUsersList.length / limit),
        },
      },
    };
  }
  public async getAdminOneUser(id: string | number) {
    const result = await this.dbservice.callProcedure(
      'usr_one_ict',
      { id },
      {},
    );
    const fs = require('fs');
    fs.writeFileSync('debug-usr-one.json', JSON.stringify(result.content, null, 2));
    return result;
  }

  public async adminUserSave(dto: any) {
    // створення нового користувача
    console.log(dto, 'dto admin 36 in admin-user-service');

    const result = await this.dbservice.callProcedure('usr_save_ict', dto, {});
    return result;
  }

  async getUserPre(id: number) {
    const result = await this.dbservice.callProcedure(
      'usr_pre_register_one',
      { id: id },
      {},
    );

    return result;
  }

  public async adminDeleteUser(id: number | string) {
    return this.dbservice.callProcedure('usr_delete', { id }, {});
  }

  public async registerFromPre(dto: any) {
    console.log(dto, 'dto admin 87 in admin-user-service');
    const result = await this.dbservice.callProcedure(
      'usr_register_from_pre',
      dto,
      {},
    );

    // Надсилаємо лист після успішної реєстрації
    if (dto.email) {
      this.mailService.sendPreRegisterSuccessGreeting(
        dto.email,
        dto.name,
        true, // showPasswordHint
      );
    }

    return result;
  }
}
