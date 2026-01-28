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

@Injectable()
export class CompanyService {
  public constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly dbservice: DatabaseService,
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
  public async findMyCompany(req: Request) {
    const userCompany = await this.pool.query(
      `select id_company from usr where id = $1`,
      [req.session.userId],
    );
    
    const id_company = userCompany.rows[0].id_company;

    const company = await this.pool.query(
      `select * from company where id = $1`,
      [id_company],
    );

    return company.rows[0];
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
