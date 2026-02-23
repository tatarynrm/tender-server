import { Injectable } from '@nestjs/common';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { DatabaseService } from 'src/database/database.service';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';

@Authorization()
@Injectable()
export class AdminCompanyService {
  public constructor(private readonly dbservice: DatabaseService) {}

  async saveCompany(dto: any) {
    const result = await this.dbservice.callProcedure('company_save', dto, {});

    return result;
  }
  async findAll(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);

    const result = await this.dbservice.callProcedure('company_list', {
      pagination: {
        per_page: query.limit ?? 50,
        page: query.page ?? 1,
      },
      filter: filters,
    });

    return result;
  }
  async findOne(id: number) {
    const result = await this.dbservice.callProcedure(
      'company_one',
      { id: id },
      {},
    );

    return result;
  }
  async getCompanyPre(id: number) {
    const result = await this.dbservice.callProcedure(
      'usr_pre_register_one',
      { id: id },
      {},
    );

    return result;
  }
}
