import { Inject, Injectable } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Pool } from 'pg';
import { DatabaseService } from 'src/database/database.service';
import { Request } from 'express';

@Injectable()
export class CompanyService {
  public constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly dbservice: DatabaseService,
  ) {}
  public async create(createCompanyDto: CreateCompanyDto) {
    console.log(createCompanyDto, 'CREATE COMPANY DTO');

    const newCompany = await this.dbservice.callProcedure(
      'company_save',

      createCompanyDto,

      {},
    );

    return newCompany;
  }

  public async findAll() {
    const companies = await this.dbservice.callProcedure(
      'company_list',

      {
        pagination: {
          page_num: 1,
          page_rows: 10,
        },
      },

      {},
    );

    return companies;
  }
  public async findMyCompany(req: Request) {
    const userCompany = await this.pool.query(
      `select id_company from usr where id = $1`,
      [req.session.userId],
    );
    console.log(userCompany.rows[0], 'user company');
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

  update(id: number, updateCompanyDto: UpdateCompanyDto) {
    return `This action updates a #${id} company`;
  }

  remove(id: number) {
    return `This action removes a #${id} company`;
  }




  // Пошук користувачів
  async searchCompanyByName() {
    // Виконання SQL запиту для пошуку користувачів
 
    const companies = await this.dbservice.callProcedure(
      'company_list',

      {
        pagination: {
          page_num: 1,
          page_rows: 10,
        },
      },

      {},
    );

    return companies;
  }

}
