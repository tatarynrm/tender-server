import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class FormDataService {
  public constructor(
    private readonly dbservice: DatabaseService,
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  public async getPreAddCargoData() {
    const result = await this.dbservice.callProcedure(
      'crm_load_form_data',

      {},

      {},
    );

    return result;
  }
  public async getCurrencies() {
    const result = await this.pool.query(`
        select * from valut`);

    return result.rows;
  }

  public async getTruckTypes() {
    // Тут аналогічно можна звернутися до БД або API
    const result = await this.pool.query(`
        select * from v_trailer_type`);

    return result.rows;
  }
}
