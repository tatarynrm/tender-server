import { Inject, Injectable } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';

import { Pool } from 'pg';
import { DatabaseService } from 'src/database/database.service';
import { Request } from 'express';
import { AdminCreateCompanyDto } from './dto/admin-create-company.dto copy';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';

import { DatabaseOracleService } from 'src/database-oracle/database-oracle.service';

@Injectable()
export class CompanyService {
  public constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly dbservice: DatabaseService,
    private readonly oracleService: DatabaseOracleService,
  ) {}
  public async create(createCompanyDto: CreateCompanyDto) {
    const newCompany = await this.dbservice.callProcedure(
      'company_save',

      createCompanyDto,

      {},
    );

    return newCompany;
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
  public async findMyCompany(migrateId?: string) {
    try {
      const data = await this.oracleService.executeProcedure<any>(
        'p_tender.GetCompany',
        { id: migrateId },
      );
      return data;
    } catch (err) {
      console.error('Error fetching company from Oracle:', err);
      throw err;
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} company`;
  }

  // update(id: number, updateCompanyDto: UpdateCompanyDto) {
  //   return `This action updates a #${id} company`;
  // }

  remove(id: number) {
    return `This action removes a #${id} company`;
  }

  // Пошук користувачів
  public async searchCompanyByName(name: string) {
    const query = `
    SELECT * 
    FROM company 
    WHERE company_name ILIKE $1
  `;

    const values = [`%${name}%`];

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  public async adminCreate(dto: AdminCreateCompanyDto) {
    const newCompany = await this.dbservice.callProcedure(
      'company_save',

      dto,

      {},
    );

    return newCompany;
  }
}
