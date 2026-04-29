import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';
import { MailService } from 'src/libs/common/mail/mail.service';

@Injectable()
export class AdminUserService {
  public constructor(
    private readonly dbservice: DatabaseService,
    private readonly mailService: MailService,
  ) {}

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
  public async getAdminOneUser(id: any) {
    const result = await this.dbservice.callProcedure(
      'usr_one_ict',

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
