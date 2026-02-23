import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';

@Injectable()
export class AdminUserService {
  public constructor(private readonly dbservice: DatabaseService) {}

  public async getAllPreRegisterUsers(query: any) {
    const result = await this.dbservice.callProcedure(
      'usr_pre_register_list',

      {
        pagination: {
          per_page: query.limit ?? 10,
          page: query.page ?? 1,
        },
        // filter: filters,
      },

      {},
    );

    return result;
  }
  public async getAdminUserList(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);

    const result = await this.dbservice.callProcedure(
      'usr_list',

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
  public async getAdminOneUser(id: any) {
    const result = await this.dbservice.callProcedure(
      'usr_one',

      {
        id: id,
      },

      {},
    );

    return result;
  }

  public async adminUserSave(dto: any) {
    // створення нового користувача
    console.log(dto, 'dto admin 36 in admin-user-service');

    const result = await this.dbservice.callProcedure('usr_save', dto, {});
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
}
